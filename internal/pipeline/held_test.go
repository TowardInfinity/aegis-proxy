package pipeline

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"guardrail/internal/store"
)

func TestHeldAddKeepsExistingDecision(t *testing.T) {
	h := NewMemoryHeld()
	first, err := h.Add(Held{Hash: "abc", Ticket: "SEC-AAA", Status: HeldPending, Reason: "first", CreatedAt: 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Decide(first.Ticket, HeldApproved, "secops", "ok"); err != nil {
		t.Fatal(err)
	}
	again, err := h.Add(Held{Hash: "abc", Ticket: "SEC-BBB", Status: HeldPending, Reason: "second", CreatedAt: 2})
	if err != nil {
		t.Fatal(err)
	}
	if again.Status != HeldApproved || again.Ticket != "SEC-AAA" || again.Reason != "first" {
		t.Fatalf("decision was reset: %+v", again)
	}
	if _, err := h.Decide("SEC-AAA", HeldRejected, "other", "no"); err != ErrHeldDecided {
		t.Fatalf("second decide err = %v", err)
	}
}

func TestHeldFindIgnoresApproved(t *testing.T) {
	h := NewMemoryHeld()
	text := "CONFIDENTIAL: Q3 forecast is 4.2B"
	hash, ticket := hashHeld(text)
	if _, err := h.Add(Held{Hash: hash, Ticket: ticket, Status: HeldPending, Reason: "forecast", CreatedAt: 1}); err != nil {
		t.Fatal(err)
	}
	msgs := []Message{{Role: "user", Content: text}}
	if _, ok := h.FindHeld(msgs); !ok {
		t.Fatal("pending content was not found")
	}
	if _, err := h.Decide(ticket, HeldApproved, "secops", ""); err != nil {
		t.Fatal(err)
	}
	if _, ok := h.FindHeld(msgs); ok {
		t.Fatal("approved content still blocks")
	}
}

func TestHeldListNewestFirst(t *testing.T) {
	h := NewMemoryHeld()
	for i, ts := range []int64{10, 30, 20} {
		if _, err := h.Add(Held{Hash: fmt.Sprintf("h%d", i), Ticket: fmt.Sprintf("SEC-%d", i), Status: HeldPending, CreatedAt: ts}); err != nil {
			t.Fatal(err)
		}
	}
	items, err := h.List(HeldPending)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || items[0].CreatedAt != 30 || items[1].CreatedAt != 20 || items[2].CreatedAt != 10 {
		t.Fatalf("order = %+v", items)
	}
	if _, err := h.Decide("SEC-0", HeldRejected, "secops", "no"); err != nil {
		t.Fatal(err)
	}
	pending, err := h.List(HeldPending)
	if err != nil || len(pending) != 2 {
		t.Fatalf("pending = %+v err %v", pending, err)
	}
}

func TestHeldCapDropsOldest(t *testing.T) {
	h := NewMemoryHeld()
	for i := 0; i < heldLimit; i++ {
		if _, err := h.Add(Held{Hash: fmt.Sprintf("%064x", i), Ticket: fmt.Sprintf("SEC-%08d", i), Status: HeldPending, CreatedAt: int64(i + 1)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.Add(Held{Hash: strings.Repeat("f", 64), Ticket: "SEC-NEW", Status: HeldPending, CreatedAt: int64(heldLimit + 5)}); err != nil {
		t.Fatal(err)
	}
	items, err := h.List("all")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != heldLimit {
		t.Fatalf("len = %d", len(items))
	}
	if _, ok := h.Lookup(fmt.Sprintf("%064x", 0)); ok {
		t.Fatal("oldest row was kept")
	}
	if _, ok := h.ByTicket("SEC-NEW"); !ok {
		t.Fatal("newest row missing")
	}
}

func TestHeldDecisionSurvivesReopen(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "guardrail.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	h, err := OpenHeld(db)
	if err != nil {
		t.Fatal(err)
	}
	text := "board pack"
	hash, ticket := hashHeld(text)
	if _, err := h.Add(Held{Hash: hash, Ticket: ticket, Key: "emp-a", Category: "financials", Reason: "forecast", Status: HeldPending, CreatedAt: 5}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Decide(ticket, HeldApproved, "secops", "cleared"); err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenHeld(db)
	if err != nil {
		t.Fatal(err)
	}
	e, ok := reopened.ByTicket(ticket)
	if !ok || e.Status != HeldApproved || e.DecidedBy != "secops" || e.Note != "cleared" || e.Key != "emp-a" {
		t.Fatalf("reopened = %+v ok %v", e, ok)
	}
	if _, ok := reopened.Lookup(hash); !ok {
		t.Fatal("hash missing after reopen")
	}
}

func TestHeldCapKeepsPendingOverDecided(t *testing.T) {
	h := NewMemoryHeld()
	for i := 0; i < heldLimit; i++ {
		if _, err := h.Add(Held{Hash: fmt.Sprintf("%064x", i), Ticket: fmt.Sprintf("SEC-%08d", i), Status: HeldPending, CreatedAt: int64(i + 1)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := h.Decide(fmt.Sprintf("SEC-%08d", 500), HeldApproved, "secops", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Add(Held{Hash: strings.Repeat("f", 64), Ticket: "SEC-NEW", Status: HeldPending, CreatedAt: int64(heldLimit + 5)}); err != nil {
		t.Fatal(err)
	}
	if _, ok := h.Lookup(fmt.Sprintf("%064x", 500)); ok {
		t.Fatal("decided row kept while a pending row was dropped")
	}
	if _, ok := h.Lookup(fmt.Sprintf("%064x", 0)); !ok {
		t.Fatal("oldest pending row dropped")
	}
}

func TestHeldDecideTouchesOnlyItsHash(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "guardrail.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`INSERT INTO held (hash, ticket, key, category, reason, status, created_at) VALUES ('b', 'SEC-SAME', 'emp-b', '', 'other text', 'pending', 1)`); err != nil {
		t.Fatal(err)
	}
	h, err := OpenHeld(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Add(Held{Hash: "a", Ticket: "SEC-SAME", Key: "emp-a", Status: HeldPending, CreatedAt: 2}); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Decide("SEC-SAME", HeldApproved, "secops", ""); err != nil {
		t.Fatal(err)
	}
	var approved int
	if err := db.QueryRow(`SELECT COUNT(*) FROM held WHERE ticket = 'SEC-SAME' AND status = 'approved'`).Scan(&approved); err != nil {
		t.Fatal(err)
	}
	if approved != 1 {
		t.Fatalf("one review approved %d rows sharing the ticket", approved)
	}
}
