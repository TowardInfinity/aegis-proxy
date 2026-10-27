// Package budget estimates cost, enforces the ceilings in config, and owns the
// spend ledger.
//
// Enforcement runs on in-memory tallies, not on the audit table, because audit
// writes are batched and a ceiling checked against a lagging table is not a
// ceiling. The tallies are seeded from the audit table at startup, so a restart
// keeps the day's spend.
package budget

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	"guardrail/internal/pipeline"
)

// SoftNudgeText is the system message injected at 80% of a ceiling. It is
// deliberately short: the nudge itself costs tokens.
const SoftNudgeText = "You are approaching your budget; be concise."

// Pricing is dollars per million tokens.
type Pricing struct {
	Input  float64
	Output float64
}

// Limits is the enforcement surface. Zero means unlimited for that dimension.
type Limits struct {
	PerKeyDailyUSD float64
	PerKeyDailyTok int
	HourlyTok      int
	GlobalDailyUSD float64
	SoftNudge      bool
}

// EstimateTokens is the chars/4 heuristic. It is intentionally crude: the
// ledger is corrected from provider usage once the response arrives.
func EstimateTokens(s string) int {
	n := len([]rune(s))
	if n == 0 {
		return 0
	}
	return (n + 3) / 4
}

// EstimateRequest sums the prompt plus the requested completion, so a huge
// max_tokens trips a ceiling before the upstream is called.
func EstimateRequest(req *pipeline.Request) int {
	total := EstimateTokens(req.Text())
	if req.MaxTokens > 0 {
		total += req.MaxTokens
	}
	return total
}

// tally is one key's rolling spend.
type tally struct {
	dailyUSD float64
	dailyTok int
	hourMark int64
	hourTok  int
}

// Ledger enforces limits and computes cost.
type Ledger struct {
	db      *sql.DB
	pricing map[string]Pricing

	mu      sync.Mutex
	keys    map[string]*tally
	dayMark int64
	globUSD float64
}

// NewLedger builds a ledger over db and seeds it from today's audit rows.
func NewLedger(db *sql.DB, pricing map[string]Pricing) *Ledger {
	l := &Ledger{db: db, pricing: pricing, keys: map[string]*tally{}, dayMark: DayStart(time.Now())}
	l.seed()
	return l
}

func (l *Ledger) seed() {
	rows, err := l.db.Query(`SELECT "key", COALESCE(SUM(cost_usd), 0), COALESCE(SUM(input_tokens + output_tokens), 0)
		FROM audit WHERE ts >= ? GROUP BY "key"`, l.dayMark)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var usd float64
		var tok int
		if rows.Scan(&key, &usd, &tok) != nil {
			return
		}
		l.keys[key] = &tally{dailyUSD: usd, dailyTok: tok}
		l.globUSD += usd
	}
}

// Price returns dollars per million tokens for a model. An unpriced model
// costs zero, so a new model never blocks traffic on a missing price.
func (l *Ledger) Price(model string) (in, out float64) {
	p, ok := l.pricing[strings.ToLower(model)]
	if !ok {
		return 0, 0
	}
	return p.Input, p.Output
}

// Cost returns the dollar cost of a turn.
func (l *Ledger) Cost(model string, input, output int) float64 {
	in, out := l.Price(model)
	return float64(input)/1e6*in + float64(output)/1e6*out
}

// Check decides whether a request may proceed.
func (l *Ledger) Check(key string, limits Limits, estimated int, now time.Time) (exceeded bool, reason string, nudge bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.roll(now)
	t := l.keys[key]
	if t == nil {
		return false, "", false
	}
	if limits.PerKeyDailyUSD > 0 && t.dailyUSD >= limits.PerKeyDailyUSD {
		return true, fmt.Sprintf("per-key daily USD ceiling %.2f reached (%.2f spent)", limits.PerKeyDailyUSD, t.dailyUSD), false
	}
	if limits.PerKeyDailyTok > 0 && t.dailyTok+estimated > limits.PerKeyDailyTok {
		return true, fmt.Sprintf("per-key daily token ceiling %d would be exceeded (%d used, %d requested)", limits.PerKeyDailyTok, t.dailyTok, estimated), false
	}
	if limits.HourlyTok > 0 && t.hourTok+estimated > limits.HourlyTok {
		return true, fmt.Sprintf("per-key hourly token ceiling %d would be exceeded (%d used, %d requested)", limits.HourlyTok, t.hourTok, estimated), false
	}
	if limits.GlobalDailyUSD > 0 && l.globUSD >= limits.GlobalDailyUSD {
		return true, fmt.Sprintf("global daily USD ceiling %.2f reached (%.2f spent)", limits.GlobalDailyUSD, l.globUSD), false
	}
	nudge = limits.SoftNudge && limits.PerKeyDailyUSD > 0 && t.dailyUSD >= 0.8*limits.PerKeyDailyUSD
	return false, "", nudge
}

// Record adds a completed turn and returns its cost. Unknown usage (a body
// the proxy could not parse) falls back to the estimate so a spend never
// vanishes.
func (l *Ledger) Record(key, model string, input, output int) float64 {
	if input == 0 && output == 0 {
		return 0
	}
	cost := l.Cost(model, input, output)
	l.mu.Lock()
	defer l.mu.Unlock()
	l.roll(time.Now())
	t := l.keys[key]
	if t == nil {
		t = &tally{hourMark: HourStart(time.Now())}
		l.keys[key] = t
	}
	t.dailyUSD += cost
	t.dailyTok += input + output
	t.hourTok += input + output
	l.globUSD += cost
	return cost
}

// roll resets tallies when the day or hour has turned. The caller holds mu.
func (l *Ledger) roll(now time.Time) {
	if today := DayStart(now); today != l.dayMark {
		l.dayMark = today
		l.globUSD = 0
		for _, t := range l.keys {
			t.dailyUSD = 0
			t.dailyTok = 0
		}
	}
	hour := HourStart(now)
	for _, t := range l.keys {
		if t.hourMark != hour {
			t.hourMark = hour
			t.hourTok = 0
		}
	}
}

// Spend reports observed spend for stats and tests.
func (l *Ledger) Spend(key string) (usd float64, dailyTok, hourlyTok int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if t := l.keys[key]; t != nil {
		return t.dailyUSD, t.dailyTok, t.hourTok
	}
	return 0, 0, 0
}

// GlobalSpend reports today's spend across all keys.
func (l *Ledger) GlobalSpend() float64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.globUSD
}

// DayStart returns local midnight for now.
func DayStart(now time.Time) int64 {
	y, m, d := now.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, now.Location()).Unix()
}

// HourStart returns the start of the current hour.
func HourStart(now time.Time) int64 {
	return now.Truncate(time.Hour).Unix()
}
