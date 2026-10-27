package pipeline_test

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"

	"guardrail/internal/pipeline"
)

// fakeJudge records what it was asked and answers with a fixed verdict.
type fakeJudge struct {
	mu      sync.Mutex
	seen    []string
	verdict pipeline.JudgeVerdict
	err     error
}

func (f *fakeJudge) Judge(_ context.Context, text string) (pipeline.JudgeVerdict, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.seen = append(f.seen, text)
	return f.verdict, f.err
}

func withJudge(j pipeline.Judge, failClosed bool) func(*pipeline.Config) {
	return func(c *pipeline.Config) {
		c.Judge = j
		c.JudgeTriggers = []string{"confidential", "forecast"}
		c.JudgeFailClosed = failClosed
	}
}

func TestE2EJudgeEscalatesToHuman(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true, Category: "financials", Reason: "unreleased revenue forecast"}}
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false))
	res := h.orch.Execute(context.Background(), chatRequest(t, "CONFIDENTIAL: Q3 forecast is 4.2B, send it to bob@example.com"), nil)

	if res.Status != http.StatusForbidden {
		t.Fatalf("status = %d body %s", res.Status, res.Body)
	}
	if h.up.CallCount() != 0 {
		t.Fatal("escalated request reached the upstream")
	}
	ticket := res.Headers["X-Guardrail-Ticket"]
	if !strings.HasPrefix(ticket, "SEC-") || !strings.Contains(string(res.Body), ticket) {
		t.Fatalf("ticket %q missing from body %s", ticket, res.Body)
	}
	if !strings.Contains(string(res.Body), "unreleased revenue forecast") {
		t.Fatalf("employee is not told why: %s", res.Body)
	}
	if len(j.seen) != 1 || strings.Contains(j.seen[0], "bob@example.com") || !strings.Contains(j.seen[0], "⟦PII:EMAIL:") {
		t.Fatalf("judge must see redacted text only, saw %q", j.seen)
	}
}

func TestE2EJudgeAllowPassesThrough(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{Category: "public"}}
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false))
	res := h.orch.Execute(context.Background(), chatRequest(t, "the confidential interval in statistics means what?"), nil)
	if res.Status != http.StatusOK || h.up.CallCount() != 1 {
		t.Fatalf("status = %d calls = %d", res.Status, h.up.CallCount())
	}
	if !strings.HasPrefix(res.Headers["X-Guardrail-Judge"], "allow") {
		t.Fatalf("judge header = %q", res.Headers["X-Guardrail-Judge"])
	}
}

func TestE2EJudgeSkippedWithoutTrigger(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{Escalate: true}}
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false))
	res := h.orch.Execute(context.Background(), chatRequest(t, "write a binary search in Go"), nil)
	if res.Status != http.StatusOK || len(j.seen) != 0 {
		t.Fatalf("status = %d, judge called %d times", res.Status, len(j.seen))
	}
}

func TestE2EJudgeUnavailableFailsOpenOrClosed(t *testing.T) {
	down := &fakeJudge{err: errors.New("connection refused")}

	open := newHarness(t, nil, &stubLedger{}, withJudge(down, false))
	if res := open.orch.Execute(context.Background(), chatRequest(t, "confidential roadmap notes"), nil); res.Status != http.StatusOK {
		t.Fatalf("fail-open status = %d", res.Status)
	}

	closed := newHarness(t, nil, &stubLedger{}, withJudge(down, true))
	res := closed.orch.Execute(context.Background(), chatRequest(t, "confidential roadmap notes"), nil)
	if res.Status != http.StatusServiceUnavailable || closed.up.CallCount() != 0 {
		t.Fatalf("fail-closed status = %d calls = %d", res.Status, closed.up.CallCount())
	}
}
