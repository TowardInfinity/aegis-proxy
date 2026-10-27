// Package cache is the response cache: an exact-match key over the normalized
// prompt, backed by SQLite so a restart keeps it, with an in-memory LRU index
// over row ids.
package cache

import (
	"container/list"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"
)

// MaxEntryBytes caps a cached response. A 256 KB body is not a chat response.
const MaxEntryBytes = 256 * 1024

// Cache stores responses keyed by normalized prompt.
type Cache struct {
	db  *sql.DB
	mu  sync.Mutex
	lru *list.List
	idx map[string]*list.Element
	cap int
	ttl time.Duration
}

type node struct {
	key string
}

// New builds a cache over db.
func New(db *sql.DB, capacity int, ttl time.Duration) *Cache {
	if capacity <= 0 {
		capacity = 5000
	}
	if ttl <= 0 {
		ttl = time.Hour
	}
	c := &Cache{db: db, lru: list.New(), idx: map[string]*list.Element{}, cap: capacity, ttl: ttl}
	c.warm()
	return c
}

func (c *Cache) warm() {
	rows, err := c.db.Query(`SELECT "key" FROM cache ORDER BY last_used DESC LIMIT ?`, c.cap)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		if rows.Scan(&k) != nil {
			return
		}
		c.idx[k] = c.lru.PushFront(&node{key: k})
	}
}

// Key builds the cache key from normalized prompt, model, and quantized
// temperature. Temperature above 0.2 disables the cache, so only quantized
// values inside that band ever appear here.
func Key(prompt, model string, temperature float64) string {
	h := sha256.New()
	h.Write([]byte(Normalize(prompt)))
	h.Write([]byte{0})
	h.Write([]byte(strings.ToLower(model)))
	h.Write([]byte{0})
	fmt.Fprintf(h, "%.1f", temperature)
	return hex.EncodeToString(h.Sum(nil))
}

// Normalize collapses whitespace runs and lowercases. Tokens are left in
// place, so a redacted value and its literal text are different keys.
func Normalize(prompt string) string {
	return strings.Join(strings.Fields(strings.ToLower(prompt)), " ")
}

// Get returns a live entry, promoting it in the LRU.
func (c *Cache) Get(key string) (body []byte, status int, ok bool) {
	c.mu.Lock()
	el, ok := c.idx[key]
	if ok {
		c.lru.MoveToFront(el)
	}
	c.mu.Unlock()
	if !ok {
		return nil, 0, false
	}
	var created int64
	err := c.db.QueryRow(`SELECT body, status, created_at FROM cache WHERE "key" = ?`, key).Scan(&body, &status, &created)
	if err != nil {
		c.evictIndex(key)
		return nil, 0, false
	}
	if time.Since(time.Unix(created, 0)) > c.ttl {
		c.Delete(key)
		return nil, 0, false
	}
	_, _ = c.db.Exec(`UPDATE cache SET last_used = ? WHERE "key" = ?`, time.Now().UnixNano(), key)
	return body, status, true
}

// Put stores a response unless it is oversized.
func (c *Cache) Put(key string, status int, body []byte) error {
	if len(body) > MaxEntryBytes {
		return fmt.Errorf("response is %d bytes, above the %d byte cache limit", len(body), MaxEntryBytes)
	}
	now := time.Now()
	if _, err := c.db.Exec(
		`INSERT INTO cache("key", status, body, created_at, last_used) VALUES(?,?,?,?,?)
		 ON CONFLICT("key") DO UPDATE SET status=excluded.status, body=excluded.body, created_at=excluded.created_at, last_used=excluded.last_used`,
		key, status, body, now.Unix(), now.UnixNano()); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.idx[key]; ok {
		c.lru.MoveToFront(el)
	} else {
		c.idx[key] = c.lru.PushFront(&node{key: key})
	}
	for c.lru.Len() > c.cap {
		back := c.lru.Back()
		if back == nil {
			break
		}
		c.lru.Remove(back)
		k := back.Value.(*node).key
		delete(c.idx, k)
		_, _ = c.db.Exec(`DELETE FROM cache WHERE "key" = ?`, k)
	}
	return nil
}

// Delete removes one entry.
func (c *Cache) Delete(key string) {
	c.evictIndex(key)
	_, _ = c.db.Exec(`DELETE FROM cache WHERE "key" = ?`, key)
}

func (c *Cache) evictIndex(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.idx[key]; ok {
		c.lru.Remove(el)
		delete(c.idx, key)
	}
}

// Len reports the indexed entry count.
func (c *Cache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.lru.Len()
}

// SweepExpired deletes rows past TTL. Call from a timer.
func (c *Cache) SweepExpired() {
	cutoff := time.Now().Add(-c.ttl).Unix()
	rows, err := c.db.Query(`SELECT "key" FROM cache WHERE created_at < ?`, cutoff)
	if err != nil {
		return
	}
	var dead []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			dead = append(dead, k)
		}
	}
	rows.Close()
	for _, k := range dead {
		c.Delete(k)
	}
}
