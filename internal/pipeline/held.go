package pipeline

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

// Held statuses. Approved entries never block a later turn; pending and
// rejected do, with different messages.
const (
	HeldPending  = "pending"
	HeldApproved = "approved"
	HeldRejected = "rejected"
)

// heldLimit caps the in-memory read path. Past it, the oldest row is dropped
// so a long-running proxy cannot grow the map without bound.
const heldLimit = 10000

// ErrHeldNotFound is an unknown ticket. ErrHeldDecided is a second decision
// on a ticket that is already approved or rejected.
var (
	ErrHeldNotFound = errors.New("held: unknown ticket")
	ErrHeldDecided  = errors.New("held: already decided")
)

// Held is one security-review ticket. Hash is the hex sha256 of the redacted
// text and never leaves the process through an HTTP response.
type Held struct {
	Hash      string
	Ticket    string
	Key       string
	Category  string
	Reason    string
	Status    string
	CreatedAt int64
	DecidedAt int64
	DecidedBy string
	Note      string
}

// HeldStore is the judge's memory of escalated content. The read path is an
// in-memory map; a SQLite-backed store writes through and reloads on startup.
type HeldStore interface {
	Add(Held) (Held, error)
	Lookup(hash string) (Held, bool)
	FindHeld(messages []Message) (Held, bool)
	Decide(ticket, status, by, note string) (Held, error)
	List(status string) ([]Held, error)
	ByTicket(ticket string) (Held, bool)
}

// hashHeld is the identity of a piece of redacted user text. The ticket is
// the first four bytes, so retries of the same content share one review.
func hashHeld(text string) (hash, ticket string) {
	sum := sha256.Sum256([]byte(text))
	hash = hex.EncodeToString(sum[:])
	ticket = "SEC-" + strings.ToUpper(hex.EncodeToString(sum[:4]))
	return hash, ticket
}

// heldStore is the map every HeldStore method reads. db is nil for the
// in-memory store tests pass in.
type heldStore struct {
	mu       sync.Mutex
	db       *sql.DB
	byHash   map[string]Held
	byTicket map[string]string
}

// NewMemoryHeld returns a store that forgets everything on restart.
func NewMemoryHeld() HeldStore {
	return newHeldStore(nil)
}

// OpenHeld loads the held table into memory. The caller owns db.
func OpenHeld(db *sql.DB) (HeldStore, error) {
	h := newHeldStore(db)
	if err := h.load(); err != nil {
		return nil, err
	}
	return h, nil
}

func newHeldStore(db *sql.DB) *heldStore {
	return &heldStore{db: db, byHash: map[string]Held{}, byTicket: map[string]string{}}
}

func (h *heldStore) load() error {
	rows, err := h.db.Query(`SELECT hash, ticket, "key", category, reason, status, created_at, decided_at, decided_by, note
		FROM held ORDER BY created_at DESC`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var drop []string
	for rows.Next() {
		var e Held
		if err := rows.Scan(&e.Hash, &e.Ticket, &e.Key, &e.Category, &e.Reason, &e.Status, &e.CreatedAt, &e.DecidedAt, &e.DecidedBy, &e.Note); err != nil {
			return err
		}
		e.Hash = strings.ToLower(e.Hash)
		if len(h.byHash) >= heldLimit {
			drop = append(drop, e.Hash)
			continue
		}
		h.byHash[e.Hash] = e
		if _, ok := h.byTicket[e.Ticket]; !ok {
			h.byTicket[e.Ticket] = e.Hash
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, hash := range drop {
		if _, err := h.db.Exec(`DELETE FROM held WHERE hash = ?`, hash); err != nil {
			return err
		}
	}
	return nil
}

// Add inserts a pending row. A hash that already exists keeps its row, so a
// repeated escalation cannot clear an approval or rejection.
func (h *heldStore) Add(in Held) (Held, error) {
	in.Hash = strings.ToLower(in.Hash)
	if in.Status == "" {
		in.Status = HeldPending
	}
	if in.CreatedAt == 0 {
		in.CreatedAt = time.Now().UnixMilli()
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if e, ok := h.byHash[in.Hash]; ok {
		return e, nil
	}
	h.evictLocked()
	if h.db != nil {
		_, err := h.db.Exec(`INSERT INTO held (hash, ticket, "key", category, reason, status, created_at, decided_at, decided_by, note)
			VALUES (?,?,?,?,?,?,?,?,?,?)`,
			in.Hash, in.Ticket, in.Key, in.Category, in.Reason, in.Status, in.CreatedAt, in.DecidedAt, in.DecidedBy, in.Note)
		if err != nil {
			return Held{}, err
		}
	}
	h.byHash[in.Hash] = in
	if _, ok := h.byTicket[in.Ticket]; !ok {
		h.byTicket[in.Ticket] = in.Hash
	}
	return in, nil
}

func (h *heldStore) evictLocked() {
	for len(h.byHash) >= heldLimit {
		var oldest Held
		first := true
		// Decided rows go first, so a pending review is never dropped while
		// a decided one remains.
		for _, e := range h.byHash {
			older := e.CreatedAt < oldest.CreatedAt || (e.CreatedAt == oldest.CreatedAt && e.Hash < oldest.Hash)
			decided, oldestDecided := e.Status != HeldPending, oldest.Status != HeldPending
			if first || (decided && !oldestDecided) || (decided == oldestDecided && older) {
				oldest = e
				first = false
			}
		}
		if first {
			return
		}
		delete(h.byHash, oldest.Hash)
		if h.byTicket[oldest.Ticket] == oldest.Hash {
			delete(h.byTicket, oldest.Ticket)
		}
		if h.db != nil {
			_, _ = h.db.Exec(`DELETE FROM held WHERE hash = ?`, oldest.Hash)
		}
	}
}

func (h *heldStore) Lookup(hash string) (Held, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.byHash[strings.ToLower(hash)]
	return e, ok
}

// FindHeld returns the first user message that is still pending or rejected.
// Approved content is invisible here so a cleared turn does not block.
func (h *heldStore) FindHeld(msgs []Message) (Held, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, m := range msgs {
		if m.Role != "user" || m.Content == "" {
			continue
		}
		sum := sha256.Sum256([]byte(m.Content))
		e, ok := h.byHash[hex.EncodeToString(sum[:])]
		if !ok {
			continue
		}
		if e.Status == HeldPending || e.Status == HeldRejected {
			return e, true
		}
	}
	return Held{}, false
}

// Decide records one review. A second call on the same ticket is refused so
// two reviewers cannot overwrite each other.
func (h *heldStore) Decide(ticket, status, by, note string) (Held, error) {
	if status != HeldApproved && status != HeldRejected {
		return Held{}, errors.New("held: status must be approved or rejected")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	hash, ok := h.byTicket[ticket]
	if !ok {
		return Held{}, ErrHeldNotFound
	}
	e := h.byHash[hash]
	if e.Status != HeldPending {
		return Held{}, ErrHeldDecided
	}
	e.Status = status
	e.DecidedAt = time.Now().UnixMilli()
	e.DecidedBy = by
	e.Note = note
	if h.db != nil {
		res, err := h.db.Exec(`UPDATE held SET status = ?, decided_at = ?, decided_by = ?, note = ? WHERE hash = ? AND status = ?`,
			e.Status, e.DecidedAt, e.DecidedBy, e.Note, hash, HeldPending)
		if err != nil {
			return Held{}, err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return Held{}, err
		}
		if n == 0 {
			return Held{}, ErrHeldDecided
		}
	}
	h.byHash[hash] = e
	return e, nil
}

// List returns rows newest first. status "all" returns every status; any
// other value filters to that status.
func (h *heldStore) List(status string) ([]Held, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]Held, 0)
	for _, e := range h.byHash {
		if status != "all" && e.Status != status {
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return heldNewer(out[i], out[j]) })
	return out, nil
}

func (h *heldStore) ByTicket(ticket string) (Held, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	hash, ok := h.byTicket[ticket]
	if !ok {
		return Held{}, false
	}
	e, ok := h.byHash[hash]
	return e, ok
}

func heldNewer(a, b Held) bool {
	if a.CreatedAt != b.CreatedAt {
		return a.CreatedAt > b.CreatedAt
	}
	return a.Ticket > b.Ticket
}
