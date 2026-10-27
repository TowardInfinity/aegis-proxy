package pipeline_test

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/cache"
	"guardrail/internal/dlp"
	"guardrail/internal/pipeline"
	"guardrail/internal/route"
	"guardrail/internal/store"
	"guardrail/internal/wire"
)

func TestE2EApproveThenSameRequestReachesUpstream(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true, Category: "financials", Reason: "unreleased revenue forecast"}}
	held := pipeline.NewMemoryHeld()
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false), func(c *pipeline.Config) { c.Held = held })
	text := "CONFIDENTIAL: Q3 forecast is 4.2B"
	first := h.orch.Execute(context.Background(), chatRequest(t, text), nil)
	if first.Status != http.StatusForbidden {
		t.Fatalf("escalate status = %d body %s", first.Status, first.Body)
	}
	ticket := first.Headers["X-Guardrail-Ticket"]
	if _, err := held.Decide(ticket, pipeline.HeldApproved, "secops", "released"); err != nil {
		t.Fatal(err)
	}
	res := h.orch.Execute(context.Background(), chatRequest(t, text), nil)
	if res.Status != http.StatusOK || h.up.CallCount() != 1 {
		t.Fatalf("status = %d calls = %d body %s", res.Status, h.up.CallCount(), res.Body)
	}
	if len(j.seen) != 1 {
		t.Fatalf("judge calls = %d, want 1 (the escalation only)", len(j.seen))
	}
	h.logger.Flush()
	rows, err := audit.Recent(h.db, 10)
	if err != nil {
		t.Fatal(err)
	}
	if !auditHasRule(rows, "judge_approved") {
		t.Fatalf("audit missing judge_approved: %+v", rows)
	}
}

func TestE2ERejectThenResendStaysBlocked(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true, Category: "financials", Reason: "unreleased revenue forecast"}}
	held := pipeline.NewMemoryHeld()
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false), func(c *pipeline.Config) { c.Held = held })
	text := "CONFIDENTIAL: Q3 forecast is 4.2B"
	first := h.orch.Execute(context.Background(), chatRequest(t, text), nil)
	ticket := first.Headers["X-Guardrail-Ticket"]
	if _, err := held.Decide(ticket, pipeline.HeldRejected, "secops", "still internal"); err != nil {
		t.Fatal(err)
	}
	res := h.orch.Execute(context.Background(), chatRequest(t, text), nil)
	if res.Status != http.StatusForbidden || h.up.CallCount() != 0 {
		t.Fatalf("status = %d calls = %d", res.Status, h.up.CallCount())
	}
	if !strings.Contains(string(res.Body), "rejected by SecOps") || !strings.Contains(string(res.Body), ticket) {
		t.Fatalf("body = %s", res.Body)
	}
	if len(j.seen) != 1 {
		t.Fatalf("judge calls = %d", len(j.seen))
	}
}

func TestE2EHeldDecisionSurvivesNewOrchestrator(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "guardrail.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	j1 := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true, Category: "financials", Reason: "forecast"}}
	h1 := harnessOnDB(t, db, j1)
	text := "CONFIDENTIAL: Q3 forecast is 4.2B"
	first := h1.orch.Execute(context.Background(), chatRequest(t, text), nil)
	if first.Status != http.StatusForbidden {
		t.Fatalf("escalate status = %d", first.Status)
	}
	if _, err := h1.held.Decide(first.Headers["X-Guardrail-Ticket"], pipeline.HeldApproved, "secops", "ok"); err != nil {
		t.Fatal(err)
	}

	j2 := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true, Category: "financials", Reason: "forecast"}}
	h2 := harnessOnDB(t, db, j2)
	res := h2.orch.Execute(context.Background(), chatRequest(t, text), nil)
	if res.Status != http.StatusOK || h2.up.CallCount() != 1 {
		t.Fatalf("after restart status = %d calls = %d body %s", res.Status, h2.up.CallCount(), res.Body)
	}
	if len(j2.seen) != 0 {
		t.Fatalf("judge ran after a persisted approval: %q", j2.seen)
	}
}

type dbHarness struct {
	orch   *pipeline.Orchestrator
	logger *audit.Logger
	up     *fakeUpstream
	held   pipeline.HeldStore
}

func harnessOnDB(t *testing.T, db *sql.DB, j *fakeJudge) *dbHarness {
	t.Helper()
	up := &fakeUpstream{}
	srv := httptest.NewServer(up)
	t.Cleanup(srv.Close)
	held, err := pipeline.OpenHeld(db)
	if err != nil {
		t.Fatal(err)
	}
	adapter := route.NewAdapter(route.Route{
		Name: "fake", Wire: "openai", BaseURL: srv.URL + "/v1", Timeout: 5 * time.Second,
	})
	logger := audit.New(db)
	t.Cleanup(logger.Close)
	cfg := pipeline.Config{
		MaxBodyBytes: 1 << 20,
		MaxTokens:    8192,
		Redact:       true,
		Detectors:    dlp.Detectors([]string{"email"}),
		Vault:        dlp.NewVault(time.Hour, 100),
		CacheEnabled: true,
		Encoding:     wire.Encoder{},
		RouteFor: func(name string) (pipeline.Adapter, bool) {
			if name == "fake" {
				return adapter, true
			}
			return nil, false
		},
		Audit:         logger,
		Judge:         j,
		JudgeTriggers: []string{"confidential", "forecast"},
		Held:          held,
	}
	return &dbHarness{orch: pipeline.New(cfg, cache.New(db, 100, time.Hour), &stubLedger{}, nil), logger: logger, up: up, held: held}
}

func auditHasRule(rows []audit.Row, rule string) bool {
	for _, row := range rows {
		for _, hit := range row.RuleHits {
			if hit.Rule == rule {
				return true
			}
		}
	}
	return false
}
