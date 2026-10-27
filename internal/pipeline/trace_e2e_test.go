package pipeline_test

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"guardrail/internal/audit"
	"guardrail/internal/pipeline"
)

var requestIDPattern = regexp.MustCompile(`^[0-9a-f]{16}$`)

func auditRow(t *testing.T, h *harness, id string) audit.Row {
	t.Helper()
	h.logger.Flush()
	rows, err := audit.Recent(h.db, 50)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row.RequestID == id {
			return row
		}
	}
	t.Fatalf("no audit row for request %s (%d rows)", id, len(rows))
	return audit.Row{}
}

func assertStagePrefix(t *testing.T, trace []audit.TraceStep, want ...string) {
	t.Helper()
	if len(trace) < len(want) {
		t.Fatalf("trace has %d steps, want prefix %v: %#v", len(trace), want, trace)
	}
	for i, stage := range want {
		if trace[i].Stage != stage {
			t.Fatalf("step %d = %q, want %q in %#v", i, trace[i].Stage, stage, trace)
		}
	}
}

func TestTraceRedactRoundTripsAndHidesTheValue(t *testing.T) {
	const secret = "jane.doe@example.com"
	h := newHarness(t, nil, &stubLedger{})
	req := chatRequest(t, "mail "+secret+" please")
	res := h.orch.Execute(context.Background(), req, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d body %s", res.Status, res.Body)
	}
	if got := res.Headers["X-Guardrail-Request-Id"]; got != req.ID || !requestIDPattern.MatchString(got) {
		t.Fatalf("request id header = %q, request %q", got, req.ID)
	}

	row := auditRow(t, h, req.ID)
	if row.RequestID != req.ID {
		t.Fatalf("audit request id = %q", row.RequestID)
	}
	assertStagePrefix(t, row.Trace, "validate", "redact", "judge", "cache", "budget", "upstream")
	var redact audit.TraceStep
	for _, step := range row.Trace {
		if strings.Contains(step.Detail, secret) || strings.Contains(step.Stage, secret) {
			t.Fatalf("trace leaked the value: %+v", step)
		}
		if step.Stage == "redact" {
			redact = step
		}
	}
	if redact.Outcome != "redact" {
		t.Fatalf("redact outcome = %q detail %q", redact.Outcome, redact.Detail)
	}
	if !strings.Contains(redact.Detail, "email") {
		t.Fatalf("redact detail = %q", redact.Detail)
	}
}

func TestTraceJudgeEscalationStopsAtJudge(t *testing.T) {
	j := &fakeJudge{verdict: pipeline.JudgeVerdict{
		Escalate: true, Category: "confidential_financial", Reason: "board pack",
	}}
	h := newHarness(t, nil, &stubLedger{}, withJudge(j, false))
	req := chatRequest(t, "CONFIDENTIAL: Q3 board pack forecast")
	res := h.orch.Execute(context.Background(), req, nil)
	if res.Status != http.StatusForbidden {
		t.Fatalf("status = %d body %s", res.Status, res.Body)
	}
	row := auditRow(t, h, req.ID)
	if len(row.Trace) == 0 {
		t.Fatal("empty trace")
	}
	last := row.Trace[len(row.Trace)-1]
	if last.Stage != "judge" || last.Outcome != "block" {
		t.Fatalf("last step = %+v, want judge/block; trace %#v", last, row.Trace)
	}
	for _, step := range row.Trace {
		switch step.Stage {
		case "cache", "budget", "upstream", "response-scan":
			t.Fatalf("escalation continued to %s: %#v", step.Stage, row.Trace)
		}
	}
}

func TestTraceCacheHitEndsAtCache(t *testing.T) {
	h := newHarness(t, nil, &stubLedger{})
	first := chatRequest(t, "hello")
	if res := h.orch.Execute(context.Background(), first, nil); res.Status != http.StatusOK {
		t.Fatalf("first status = %d body %s", res.Status, res.Body)
	}
	second := chatRequest(t, "hello")
	res := h.orch.Execute(context.Background(), second, nil)
	if res.Headers["X-Guardrail-Cache"] != "HIT" {
		t.Fatalf("cache header = %q status %d", res.Headers["X-Guardrail-Cache"], res.Status)
	}
	row := auditRow(t, h, second.ID)
	if len(row.Trace) == 0 {
		t.Fatal("empty trace")
	}
	last := row.Trace[len(row.Trace)-1]
	if last.Stage != "cache" || last.Outcome != "hit" {
		t.Fatalf("last step = %+v, want cache/hit; trace %#v", last, row.Trace)
	}
	if !strings.Contains(last.Detail, "saved") {
		t.Fatalf("hit detail = %q", last.Detail)
	}
}
