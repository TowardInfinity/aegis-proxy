package budget

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"guardrail/internal/pipeline"
	"guardrail/internal/store"
)

func newLedger(t *testing.T) *Ledger {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "budget.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	// $1000 per million tokens, so 1000 tokens costs exactly $1.
	return NewLedger(db, map[string]Pricing{"gpt-4o": {Input: 1000, Output: 1000}})
}

func TestEstimateTokens(t *testing.T) {
	cases := map[string]int{"": 0, "abcd": 1, "abcde": 2, "12345678": 2}
	for text, want := range cases {
		if got := EstimateTokens(text); got != want {
			t.Errorf("EstimateTokens(%q) = %d, want %d", text, got, want)
		}
	}
	req := &pipeline.Request{Messages: []pipeline.Message{{Role: "user", Content: "12345678"}}, MaxTokens: 100}
	want := EstimateTokens(req.Text()) + req.MaxTokens
	if got := EstimateRequest(req); got != want {
		t.Fatalf("EstimateRequest = %d, want %d", got, want)
	}
}

func TestCheckEnforcesCeilings(t *testing.T) {
	l := newLedger(t)
	limits := Limits{PerKeyDailyUSD: 10, SoftNudge: true}

	exceeded, _, nudge := l.Check("k", limits, 10, time.Now())
	if exceeded || nudge {
		t.Fatalf("fresh key refused: exceeded=%v nudge=%v", exceeded, nudge)
	}

	if cost := l.Record("k", "gpt-4o", 4000, 0); cost != 4 {
		t.Fatalf("cost = %v, want 4", cost)
	}
	if exceeded, _, nudge := l.Check("k", limits, 10, time.Now()); exceeded || nudge {
		t.Fatalf("40%% spend refused: exceeded=%v nudge=%v", exceeded, nudge)
	}

	l.Record("k", "gpt-4o", 4400, 0) // 8.4 / 10
	if exceeded, _, nudge := l.Check("k", limits, 10, time.Now()); exceeded || !nudge {
		t.Fatalf("84%% spend: exceeded=%v nudge=%v, want nudge", exceeded, nudge)
	}

	l.Record("k", "gpt-4o", 2000, 0) // 10.4 / 10
	exceeded, reason, _ := l.Check("k", limits, 10, time.Now())
	if !exceeded {
		t.Fatal("per-key USD ceiling not enforced")
	}
	if !strings.Contains(reason, "per-key daily USD") {
		t.Fatalf("reason = %q", reason)
	}
}

func TestHourlyCeiling(t *testing.T) {
	l := newLedger(t)
	l.Record("k", "gpt-4o", 500, 0)
	exceeded, reason, _ := l.Check("k", Limits{HourlyTok: 600}, 200, time.Now())
	if !exceeded || !strings.Contains(reason, "hourly") {
		t.Fatalf("hourly ceiling: exceeded=%v reason=%q", exceeded, reason)
	}
}

func TestFirstRequestCanExceedTokenCeiling(t *testing.T) {
	l := newLedger(t)
	limits := Limits{PerKeyDailyTok: 100}
	exceeded, reason, _ := l.Check("new-key", limits, 5000, time.Now())
	if !exceeded {
		t.Fatal("a first request larger than the daily ceiling was allowed")
	}
	if !strings.Contains(reason, "token ceiling") {
		t.Fatalf("reason = %q", reason)
	}
}

func TestGlobalCeiling(t *testing.T) {
	l := newLedger(t)
	l.Record("a", "gpt-4o", 6000, 0)
	l.Record("b", "gpt-4o", 6000, 0)
	exceeded, reason, _ := l.Check("c", Limits{GlobalDailyUSD: 10}, 1, time.Now())
	if !exceeded || !strings.Contains(reason, "global") {
		t.Fatalf("global ceiling: exceeded=%v reason=%q", exceeded, reason)
	}
}

func TestUnpricedModelCostsZero(t *testing.T) {
	l := newLedger(t)
	if cost := l.Record("k", "mystery-model", 10000, 10000); cost != 0 {
		t.Fatalf("unpriced model cost = %v", cost)
	}
	if in, out := l.Price("GPT-4O"); in == 0 || out == 0 {
		t.Fatalf("price lookup is not case-insensitive: %v %v", in, out)
	}
}

func TestSpendSurvivesRestart(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "seed.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	pricing := map[string]Pricing{"gpt-4o": {Input: 1000, Output: 1000}}
	l := NewLedger(db, pricing)
	l.Record("k", "gpt-4o", 3000, 0)

	// The audit table is the seed; write the row the way the logger would.
	if _, err := db.Exec(`INSERT INTO audit (ts, "key", model, action, stage, cost_usd, input_tokens, output_tokens)
		VALUES (?, 'k', 'gpt-4o', 'pass', 'ledger-write', 3.0, 3000, 0)`, DayStart(time.Now())+1); err != nil {
		t.Fatal(err)
	}
	restarted := NewLedger(db, pricing)
	if usd, _, _ := restarted.Spend("k"); usd != 3.0 {
		t.Fatalf("seeded spend = %v, want 3.0", usd)
	}
}
