// Package audit writes one row per request to SQLite, batched so the data
// plane does not pay a transaction per request.
package audit

import (
	"database/sql"
	"encoding/json"
	"sync"
	"time"
)

// Hit is one detector firing, as the audit table stores it.
type Hit struct {
	Rule   string  `json:"rule"`
	Score  float64 `json:"score"`
	Sample string  `json:"sample,omitempty"`
}

// TraceStep is one pipeline stage. It lives here, not in pipeline, so the
// audit row can store it without an import cycle. Details are short and
// never include a raw detected value.
type TraceStep struct {
	Stage   string  `json:"stage"`
	Outcome string  `json:"outcome"`
	MS      float64 `json:"ms"`
	Detail  string  `json:"detail"`
}

// Row is one audited request. Fields stay untagged so the ledger JSON keeps
// the historical names (TS, Key, RequestID).
type Row struct {
	TS           time.Time
	Key          string
	Route        string
	Model        string
	Action       string
	Stage        string
	RuleHits     []Hit
	LatencyMS    int64
	InputTokens  int
	OutputTokens int
	CostUSD      float64
	CacheHit     bool
	SavedTokens  int
	SavedUSD     float64
	RequestID    string
	Trace        []TraceStep
}

// Batch is the size the logger flushes at.
const Batch = 100

// Logger batches rows and writes them on a timer.
type Logger struct {
	db    *sql.DB
	mu    sync.Mutex
	buf   []Row
	stop  chan struct{}
	done  chan struct{}
	every time.Duration
}

// New starts a batched logger. Call Close to flush and stop.
func New(db *sql.DB) *Logger {
	l := &Logger{db: db, stop: make(chan struct{}), done: make(chan struct{}), every: time.Second}
	go l.loop()
	return l
}

func (l *Logger) loop() {
	defer close(l.done)
	t := time.NewTicker(l.every)
	defer t.Stop()
	for {
		select {
		case <-l.stop:
			l.Flush()
			return
		case <-t.C:
			l.Flush()
		}
	}
}

// Write queues a row, flushing when the batch is full.
func (l *Logger) Write(r Row) {
	if r.TS.IsZero() {
		r.TS = time.Now()
	}
	l.mu.Lock()
	l.buf = append(l.buf, r)
	full := len(l.buf) >= Batch
	l.mu.Unlock()
	if full {
		l.Flush()
	}
}

// Flush writes and clears the buffer.
func (l *Logger) Flush() {
	l.mu.Lock()
	batch := l.buf
	l.buf = nil
	l.mu.Unlock()
	if len(batch) == 0 {
		return
	}
	Insert(l.db, batch)
}

// Insert writes rows in one transaction.
func Insert(db *sql.DB, rows []Row) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(`INSERT INTO audit
		(ts, "key", route, model, action, stage, rule_hits, latency_ms, input_tokens, output_tokens, cost_usd, cache_hit, saved_tokens, saved_usd, request_id, trace)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()
	for _, r := range rows {
		hits, _ := json.Marshal(r.RuleHits)
		if r.RuleHits == nil {
			hits = []byte("[]")
		}
		trace, _ := json.Marshal(r.Trace)
		if r.Trace == nil {
			trace = []byte("[]")
		}
		cacheHit := 0
		if r.CacheHit {
			cacheHit = 1
		}
		if _, err := stmt.Exec(r.TS.Unix(), r.Key, r.Route, r.Model, string(r.Action), r.Stage, string(hits),
			r.LatencyMS, r.InputTokens, r.OutputTokens, r.CostUSD, cacheHit, r.SavedTokens, r.SavedUSD, r.RequestID, string(trace)); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// Close flushes and stops the background loop.
func (l *Logger) Close() {
	close(l.stop)
	<-l.done
}

// Stats is the aggregate the admin endpoint and the CLI share.
type Stats struct {
	TotalRequests   int            `json:"total_requests"`
	CacheHits       int            `json:"cache_hits"`
	CacheHitRate    float64        `json:"cache_hit_rate"`
	TokensSaved     int            `json:"tokens_saved"`
	USDSaved        float64        `json:"usd_saved"`
	USDSpent        float64        `json:"usd_spent"`
	InputTokens     int            `json:"input_tokens"`
	OutputTokens    int            `json:"output_tokens"`
	BlocksByStage   map[string]int `json:"blocks_by_stage"`
	Actions         map[string]int `json:"actions"`
	MedianLatencyMS int64          `json:"median_latency_ms"`
}

// Aggregate reads the stats from the audit table. Every surface (admin, CLI,
// tests) reads through this one function so the numbers cannot drift.
func Aggregate(db *sql.DB) (Stats, error) {
	s := Stats{BlocksByStage: map[string]int{}, Actions: map[string]int{}}
	err := db.QueryRow(`SELECT COUNT(*),
		COALESCE(SUM(cache_hit), 0),
		COALESCE(SUM(saved_tokens), 0),
		COALESCE(SUM(saved_usd), 0),
		COALESCE(SUM(cost_usd), 0),
		COALESCE(SUM(input_tokens), 0),
		COALESCE(SUM(output_tokens), 0)
		FROM audit`).Scan(&s.TotalRequests, &s.CacheHits, &s.TokensSaved, &s.USDSaved, &s.USDSpent, &s.InputTokens, &s.OutputTokens)
	if err != nil {
		return s, err
	}
	if s.TotalRequests > 0 {
		s.CacheHitRate = float64(s.CacheHits) / float64(s.TotalRequests)
	}
	rows, err := db.Query(`SELECT action, stage, COUNT(*) FROM audit WHERE action = 'block' OR action = 'cache_hit' OR action = 'redact' GROUP BY action, stage`)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var action, stage string
		var n int
		if err := rows.Scan(&action, &stage, &n); err != nil {
			return s, err
		}
		s.Actions[action] += n
		if action == "block" {
			s.BlocksByStage[stage] += n
		}
	}
	s.MedianLatencyMS = medianLatency(db)
	return s, rows.Err()
}

func medianLatency(db *sql.DB) int64 {
	var n int
	if db.QueryRow(`SELECT COUNT(*) FROM audit`).Scan(&n) != nil || n == 0 {
		return 0
	}
	var med sql.NullInt64
	_ = db.QueryRow(`SELECT latency_ms FROM audit ORDER BY latency_ms LIMIT 1 OFFSET ?`, n/2).Scan(&med)
	return med.Int64
}

// Recent returns the most recent rows.
func Recent(db *sql.DB, limit int) ([]Row, error) {
	if limit <= 0 || limit > 1000 {
		limit = 100
	}
	rows, err := db.Query(`SELECT ts, "key", route, model, action, stage, rule_hits, latency_ms, input_tokens, output_tokens, cost_usd, cache_hit, saved_tokens, saved_usd, request_id, trace
		FROM audit ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var (
			r        Row
			ts       int64
			hits     string
			cacheHit int
			action   string
			trace    string
		)
		if err := rows.Scan(&ts, &r.Key, &r.Route, &r.Model, &action, &r.Stage, &hits,
			&r.LatencyMS, &r.InputTokens, &r.OutputTokens, &r.CostUSD, &cacheHit, &r.SavedTokens, &r.SavedUSD, &r.RequestID, &trace); err != nil {
			return nil, err
		}
		r.TS = time.Unix(ts, 0)
		r.Action = action
		r.CacheHit = cacheHit == 1
		_ = json.Unmarshal([]byte(hits), &r.RuleHits)
		if trace != "" && trace != "[]" && trace != "null" {
			_ = json.Unmarshal([]byte(trace), &r.Trace)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
