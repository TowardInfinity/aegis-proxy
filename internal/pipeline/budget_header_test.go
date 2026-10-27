package pipeline_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"

	"guardrail/internal/pipeline"
)

const budgetRemainingHeader = "X-Guardrail-Budget-Remaining-Tokens"

// tokenLedger is a budget ledger that also reports a daily token ceiling.
type tokenLedger struct {
	*stubLedger
	ceiling int
	used    int
}

func (t tokenLedger) DailyTokens(string) (int, int) { return t.ceiling, t.used }

func estimatedTokens(req *pipeline.Request) int {
	n := (len([]rune(req.Text())) + 3) / 4
	if req.MaxTokens > 0 {
		n += req.MaxTokens
	}
	return n
}

func TestBudgetRemainingHeader(t *testing.T) {
	led := tokenLedger{stubLedger: &stubLedger{}, ceiling: 1500, used: 100}
	h := newHarness(t, nil, led)
	req := chatRequest(t, "hello")
	res := h.orch.Execute(context.Background(), req, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d body %s", res.Status, res.Body)
	}
	want := strconv.Itoa(1500 - 100 - estimatedTokens(req))
	if got := res.Headers[budgetRemainingHeader]; got != want {
		t.Fatalf("remaining = %q, want %q", got, want)
	}

	hit := chatRequest(t, "hello")
	cached := h.orch.Execute(context.Background(), hit, nil)
	if cached.Headers["X-Guardrail-Cache"] != "HIT" {
		t.Fatalf("cache = %q status %d", cached.Headers["X-Guardrail-Cache"], cached.Status)
	}
	if _, ok := cached.Headers[budgetRemainingHeader]; ok {
		t.Fatalf("cache hit carried %q", cached.Headers[budgetRemainingHeader])
	}
}

func TestBudgetRemainingOmitsUnlimitedAndExceeded(t *testing.T) {
	plain := newHarness(t, nil, &stubLedger{})
	res := plain.orch.Execute(context.Background(), chatRequest(t, "hello"), nil)
	if _, ok := res.Headers[budgetRemainingHeader]; ok {
		t.Fatal("a ledger without a token ceiling set the header")
	}

	unlimited := newHarness(t, nil, tokenLedger{stubLedger: &stubLedger{}, ceiling: 0, used: 40})
	res = unlimited.orch.Execute(context.Background(), chatRequest(t, "hello"), nil)
	if res.Status != http.StatusOK {
		t.Fatalf("unlimited status = %d", res.Status)
	}
	if _, ok := res.Headers[budgetRemainingHeader]; ok {
		t.Fatal("unlimited ceiling set the header")
	}

	floored := newHarness(t, nil, tokenLedger{stubLedger: &stubLedger{}, ceiling: 1500, used: 1490})
	req := chatRequest(t, "hello")
	res = floored.orch.Execute(context.Background(), req, nil)
	if got := res.Headers[budgetRemainingHeader]; got != "0" {
		t.Fatalf("floored remaining = %q, want 0 (estimate %d)", got, estimatedTokens(req))
	}

	blocked := newHarness(t, nil, tokenLedger{stubLedger: &stubLedger{exceeded: true}, ceiling: 1500, used: 1500})
	res = blocked.orch.Execute(context.Background(), chatRequest(t, "hello"), nil)
	if res.Status != http.StatusTooManyRequests {
		t.Fatalf("exceeded status = %d", res.Status)
	}
	if _, ok := res.Headers[budgetRemainingHeader]; ok {
		t.Fatal("exceeded check set the header")
	}
}

func TestBudgetRemainingHeaderOnStream(t *testing.T) {
	led := tokenLedger{stubLedger: &stubLedger{}, ceiling: 1500, used: 100}
	h := newHarness(t, &fakeUpstream{stream: true}, led)
	req := chatRequest(t, "hello")
	req.Stream = true
	sink := &captureSink{}
	res := h.orch.Execute(context.Background(), req, sink)
	if res.Status != http.StatusOK || sink.status != http.StatusOK {
		t.Fatalf("status %d sink %d", res.Status, sink.status)
	}
	want := strconv.Itoa(1500 - 100 - estimatedTokens(req))
	if got := sink.headers[budgetRemainingHeader]; got != want {
		t.Fatalf("stream remaining = %q, want %q", got, want)
	}
}
