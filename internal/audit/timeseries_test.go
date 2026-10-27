package audit

import (
	"database/sql"
	"math"
	"path/filepath"
	"testing"
	"time"

	"guardrail/internal/store"
)

func openAuditDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "audit.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func insertAudit(t *testing.T, db *sql.DB, ts int64, action string, cost float64) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO audit (ts, action, stage, cost_usd) VALUES (?, ?, 'test', ?)`, ts, action, cost)
	if err != nil {
		t.Fatal(err)
	}
}

func TestTimeseriesBucketsIncludeGaps(t *testing.T) {
	db := openAuditDB(t)
	now := time.Unix(1_700_000_130, 0)
	end := now.Unix() / 60 * 60
	start := end - 4*60

	insertAudit(t, db, end-240, "pass", 4)
	insertAudit(t, db, end-120, "cache_hit", 0)
	insertAudit(t, db, end-60, "block", 1)
	insertAudit(t, db, end, "pass", 2)
	insertAudit(t, db, end+10, "pass", 0)
	insertAudit(t, db, end+20, "redact", 0.5)
	insertAudit(t, db, end+30, "note", 0.25) // unknown action counts toward spend only
	insertAudit(t, db, start-1, "pass", 100) // just outside the window
	insertAudit(t, db, end+60, "pass", 100)  // the next minute

	series, err := Timeseries(db, 5, now)
	if err != nil {
		t.Fatal(err)
	}
	if series.BucketSec != 60 || len(series.Points) != 5 {
		t.Fatalf("series = %+v, want 5 minute buckets", series)
	}
	want := []Point{
		{T: start, Pass: 1, USD: 4},
		{T: start + 60},
		{T: start + 120, CacheHit: 1},
		{T: start + 180, Block: 1, USD: 1},
		{T: end, Pass: 2, Redact: 1, USD: 2.75},
	}
	for i, p := range series.Points {
		g := want[i]
		if p.T != g.T || p.Pass != g.Pass || p.Redact != g.Redact || p.Block != g.Block || p.CacheHit != g.CacheHit || math.Abs(p.USD-g.USD) > 1e-9 {
			t.Fatalf("point %d = %+v, want %+v", i, p, g)
		}
	}
}

func TestTimeseriesClampsWindow(t *testing.T) {
	db := openAuditDB(t)
	now := time.Unix(1_700_000_000, 0)
	for _, minutes := range []int{0, -3} {
		series, err := Timeseries(db, minutes, now)
		if err != nil {
			t.Fatal(err)
		}
		if series.BucketSec != 60 || len(series.Points) != 60 {
			t.Fatalf("minutes %d -> bucket %d len %d", minutes, series.BucketSec, len(series.Points))
		}
	}
	series, err := Timeseries(db, 5000, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(series.Points) != 1440 {
		t.Fatalf("cap len = %d, want 1440", len(series.Points))
	}
	if series.Points[1439].T-series.Points[0].T != 1439*60 {
		t.Fatalf("span = %d", series.Points[1439].T-series.Points[0].T)
	}
	series, err = Timeseries(db, 1, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(series.Points) != 1 || series.Points[0].T != now.Unix()/60*60 {
		t.Fatalf("one minute = %+v", series.Points)
	}
}
