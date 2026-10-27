package cache

import (
	"path/filepath"
	"testing"
	"time"

	"guardrail/internal/store"
)

func newCache(t *testing.T) *Cache {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "cache.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return New(db, 10, time.Hour)
}

func TestKeyNormalization(t *testing.T) {
	a := Key("Hello   World\n\tfrom  Tokyo", "gpt-4o", 0.2)
	b := Key("hello world from tokyo", "gpt-4o", 0.2)
	if a != b {
		t.Fatal("whitespace and case differences changed the key")
	}
	if Key("hello world", "gpt-4o", 0.2) == Key("hello world", "gpt-4o-mini", 0.2) {
		t.Fatal("model is not part of the key")
	}
	if Key("hello world", "gpt-4o", 0.2) == Key("hello world", "gpt-4o", 0.1) {
		t.Fatal("temperature is not part of the key")
	}
	if Key("hello ⟦PII:EMAIL:1⟧", "gpt-4o", 0) == Key("hello jane@example.com", "gpt-4o", 0) {
		t.Fatal("a token and its literal value must not share a key")
	}
}

func TestPutGetMiss(t *testing.T) {
	c := newCache(t)
	if _, _, ok := c.Get("absent"); ok {
		t.Fatal("empty cache returned a hit")
	}
	body := []byte(`{"choices":[{"message":{"content":"hi"}}]}`)
	if err := c.Put("k1", 200, body); err != nil {
		t.Fatal(err)
	}
	got, status, ok := c.Get("k1")
	if !ok || status != 200 || string(got) != string(body) {
		t.Fatalf("Get = %q, %d, %v", got, status, ok)
	}
	if c.Len() != 1 {
		t.Fatalf("Len = %d", c.Len())
	}
}

func TestLRUEvictsOldest(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "lru.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	c := New(db, 2, time.Hour)
	_ = c.Put("a", 200, []byte("a"))
	_ = c.Put("b", 200, []byte("b"))
	if _, _, ok := c.Get("a"); !ok {
		t.Fatal("a missing before eviction")
	}
	_ = c.Put("c", 200, []byte("c")) // evicts b, the least recently used
	if _, _, ok := c.Get("b"); ok {
		t.Fatal("b survived eviction")
	}
	if _, _, ok := c.Get("a"); !ok {
		t.Fatal("a was evicted despite being touched")
	}
	if _, _, ok := c.Get("c"); !ok {
		t.Fatal("c missing")
	}
}

func TestExpiredEntryMisses(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "ttl.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	c := New(db, 10, time.Hour)
	_ = c.Put("old", 200, []byte("old"))
	if _, err := db.Exec(`UPDATE cache SET created_at = ? WHERE "key" = 'old'`, time.Now().Add(-2*time.Hour).Unix()); err != nil {
		t.Fatal(err)
	}
	if _, _, ok := c.Get("old"); ok {
		t.Fatal("expired entry returned a hit")
	}
}

func TestOversizedEntryRejected(t *testing.T) {
	c := newCache(t)
	big := make([]byte, MaxEntryBytes+1)
	if err := c.Put("big", 200, big); err == nil {
		t.Fatal("oversized body accepted")
	}
}
