package server

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"guardrail/internal/pipeline"
)

// heldView is the admin queue item. The content hash stays in the store.
type heldView struct {
	Ticket    string `json:"ticket"`
	Key       string `json:"key"`
	Category  string `json:"category"`
	Reason    string `json:"reason"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"created_at"`
	DecidedAt int64  `json:"decided_at"`
	DecidedBy string `json:"decided_by"`
	Note      string `json:"note"`
}

func heldToView(e pipeline.Held) heldView {
	return heldView{
		Ticket: e.Ticket, Key: e.Key, Category: e.Category, Reason: e.Reason,
		Status: e.Status, CreatedAt: e.CreatedAt, DecidedAt: e.DecidedAt,
		DecidedBy: e.DecidedBy, Note: e.Note,
	}
}

func (s *Server) handleHeldList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = pipeline.HeldPending
	}
	switch status {
	case pipeline.HeldPending, pipeline.HeldApproved, pipeline.HeldRejected, "all":
	default:
		http.Error(w, "status must be pending, approved, rejected, or all", http.StatusBadRequest)
		return
	}
	items, err := s.held.List(status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]heldView, 0, len(items))
	for _, e := range items {
		out = append(out, heldToView(e))
	}
	writeJSON(w, map[string]any{"items": out})
}

func (s *Server) handleHeldApprove(w http.ResponseWriter, r *http.Request) {
	s.decideHeld(w, r, pipeline.HeldApproved)
}

func (s *Server) handleHeldReject(w http.ResponseWriter, r *http.Request) {
	s.decideHeld(w, r, pipeline.HeldRejected)
}

func (s *Server) decideHeld(w http.ResponseWriter, r *http.Request, status string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Reviewer string `json:"reviewer"`
		Note     string `json:"note"`
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<16))
	if err := dec.Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	reviewer := strings.TrimSpace(body.Reviewer)
	if reviewer == "" {
		reviewer = "secops"
	}
	if len(reviewer) > 200 || len(body.Note) > 2000 {
		http.Error(w, "reviewer or note is too long", http.StatusBadRequest)
		return
	}
	item, err := s.held.Decide(r.PathValue("ticket"), status, reviewer, body.Note)
	if errors.Is(err, pipeline.ErrHeldNotFound) {
		http.NotFound(w, r)
		return
	}
	if errors.Is(err, pipeline.ErrHeldDecided) {
		http.Error(w, "already decided", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, heldToView(item))
}

// handleTicket is the employee lookup. A ticket that belongs to someone else
// is indistinguishable from one that does not exist.
func (s *Server) handleTicket(w http.ResponseWriter, r *http.Request) pipeline.Result {
	key := clientKey(r)
	if s.limiter != nil && !s.limiter.Allow(key, clientIP(r)) {
		return pipeline.Result{
			Status:  http.StatusTooManyRequests,
			Body:    []byte(`{"error":"rate limit exceeded"}`),
			Headers: map[string]string{"Content-Type": "application/json", "Retry-After": "60"},
		}
	}
	notFound := pipeline.Result{
		Status:  http.StatusNotFound,
		Body:    []byte(`{"error":"not found"}`),
		Headers: map[string]string{"Content-Type": "application/json"},
	}
	// Without a key every caller shares "anonymous", so ownership proves nothing.
	if key == "anonymous" {
		return notFound
	}
	e, ok := s.held.ByTicket(r.PathValue("ticket"))
	if !ok || subtle.ConstantTimeCompare([]byte(e.Key), []byte(key)) != 1 {
		return notFound
	}
	body, _ := json.Marshal(struct {
		Ticket    string `json:"ticket"`
		Status    string `json:"status"`
		Reason    string `json:"reason"`
		CreatedAt int64  `json:"created_at"`
		DecidedAt int64  `json:"decided_at"`
		Note      string `json:"note"`
	}{e.Ticket, e.Status, e.Reason, e.CreatedAt, e.DecidedAt, e.Note})
	return pipeline.Result{
		Status:  http.StatusOK,
		Body:    body,
		Headers: map[string]string{"Content-Type": "application/json"},
	}
}
