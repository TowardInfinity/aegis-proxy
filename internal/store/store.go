// Package store owns the single SQLite handle and the schema every other
// package writes through. One connection with WAL keeps the single-writer
// invariant that DESIGN.md calls out.
package store

import (
	"database/sql"
	"fmt"
	"path/filepath"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS audit (
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
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);
CREATE INDEX IF NOT EXISTS audit_key_ts ON audit("key", ts);

CREATE TABLE IF NOT EXISTS cache (
	"key" TEXT PRIMARY KEY,
	status INTEGER NOT NULL,
	body BLOB NOT NULL,
	created_at INTEGER NOT NULL,
	last_used INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config_loads (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	ts INTEGER NOT NULL,
	path TEXT NOT NULL,
	hash TEXT NOT NULL,
	signed INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS held (
	hash TEXT PRIMARY KEY,
	ticket TEXT NOT NULL,
	"key" TEXT NOT NULL DEFAULT '',
	category TEXT NOT NULL DEFAULT '',
	reason TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'pending',
	created_at INTEGER NOT NULL,
	decided_at INTEGER NOT NULL DEFAULT 0,
	decided_by TEXT NOT NULL DEFAULT '',
	note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS held_ticket ON held(ticket);
CREATE INDEX IF NOT EXISTS held_status ON held(status);
`

// Open opens (creating if needed) the SQLite database and applies the schema.
func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	db.SetMaxOpenConns(1)
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate sqlite %s: %w", path, err)
	}
	return db, nil
}

// migrate applies the schema, then additive column changes. CREATE TABLE IF
// NOT EXISTS does not add columns to a database that already exists, so each
// new column is an ALTER that ignores "duplicate column name".
func migrate(db *sql.DB) error {
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	return nil
}

func dsn(path string) string {
	const pragmas = "_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	if path == ":memory:" {
		return "file::memory:?" + pragmas
	}
	return "file:" + filepath.ToSlash(path) + "?_pragma=journal_mode(WAL)&" + pragmas
}
