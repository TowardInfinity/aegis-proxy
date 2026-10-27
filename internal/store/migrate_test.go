package store_test

import (
	"database/sql"
	"path/filepath"
	"testing"

	"guardrail/internal/audit"
	"guardrail/internal/store"

	_ "modernc.org/sqlite"
)

// An audit table from before the trace columns must gain them, and a second
// open must ignore the duplicate ALTER.
func TestAuditTraceColumnsMigrate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	seed, err := sql.Open("sqlite", "file:"+filepath.ToSlash(path)+"?_pragma=busy_timeout(5000)")
	if err != nil {
		t.Fatal(err)
	}
	_, err = seed.Exec(`CREATE TABLE audit (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ts INTEGER NOT NULL,
		"key" TEXT NOT NULL DEFAULT '',
		route TEXT NOT NULL DEFAULT '',
		model TEXT NOT NULL DEFAULT '',
		action TEXT NOT NULL,
		stage TEXT NOT NULL,
		rule_hits TEXT NOT NULL DEFAULT '[]',
		latency_ms INTEGER NOT NULL DEFAULT 0,
		input_tokens INTEGER NOT NULL DEFAULT 0,
		output_tokens INTEGER NOT NULL DEFAULT 0,
		cost_usd REAL NOT NULL DEFAULT 0,
		cache_hit INTEGER NOT NULL DEFAULT 0,
		saved_tokens INTEGER NOT NULL DEFAULT 0,
		saved_usd REAL NOT NULL DEFAULT 0
	)`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := seed.Exec(`INSERT INTO audit (ts, "key", action, stage) VALUES (1, 'k', 'pass', 'validate')`); err != nil {
		t.Fatal(err)
	}
	if err := seed.Close(); err != nil {
		t.Fatal(err)
	}

	db, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	cols := columnSet(t, db, "audit")
	if !cols["request_id"] || !cols["trace"] {
		t.Fatalf("columns after migrate: %v", cols)
	}
	rows, err := audit.Recent(db, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].RequestID != "" || rows[0].Trace != nil {
		t.Fatalf("pre-trace row = %+v", rows)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	again, err := store.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	again.Close()
}

func columnSet(t *testing.T, db *sql.DB, table string) map[string]bool {
	t.Helper()
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			t.Fatal(err)
		}
		out[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}
