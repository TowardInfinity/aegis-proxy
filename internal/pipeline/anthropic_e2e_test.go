package pipeline_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"guardrail/internal/dlp"
	"guardrail/internal/pipeline"
	"guardrail/internal/route"
	"guardrail/internal/wire"
)

// anthropicUpstream records the Messages body it receives and answers with a
// fixed assistant message.
type anthropicUpstream struct {
	mu     sync.Mutex
	bodies [][]byte
}

func (a *anthropicUpstream) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	a.mu.Lock()
	a.bodies = append(a.bodies, body)
	a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, `{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5",`+
		`"content":[{"type":"text","text":"done"}],"stop_reason":"end_turn","usage":{"input_tokens":20,"output_tokens":2}}`)
}

func (a *anthropicUpstream) body(t *testing.T, i int) map[string]any {
	t.Helper()
	a.mu.Lock()
	defer a.mu.Unlock()
	if i >= len(a.bodies) {
		t.Fatalf("upstream received %d bodies, want index %d", len(a.bodies), i)
	}
	var doc map[string]any
	if err := json.Unmarshal(a.bodies[i], &doc); err != nil {
		t.Fatalf("upstream body is not JSON: %v", err)
	}
	return doc
}

func (a *anthropicUpstream) raw(i int) string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return string(a.bodies[i])
}

func newAnthropicHarness(t *testing.T) (*harness, *anthropicUpstream) {
	t.Helper()
	up := &anthropicUpstream{}
	srv := httptest.NewServer(up)
	t.Cleanup(srv.Close)
	adapter := route.NewAdapter(route.Route{
		Name: "anth", Wire: "anthropic", BaseURL: srv.URL, Timeout: 5 * time.Second,
	})
	h := newHarness(t, nil, &stubLedger{}, func(c *pipeline.Config) {
		c.Detectors = dlp.Detectors([]string{"email", "aws_key", "credit_card", "generic_secret"})
		c.RouteFor = func(name string) (pipeline.Adapter, bool) {
			if name == "anth" {
				return adapter, true
			}
			return nil, false
		}
	})
	return h, up
}

func anthropicRequest(t *testing.T, body string) *pipeline.Request {
	t.Helper()
	req, err := wire.ParseAnthropic([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	req.ID = pipeline.NewID()
	req.Key = "emp-alice"
	req.Route = "anth"
	return req
}

// A Claude Code turn: cached system blocks, a tool call that read .env, and
// the file contents coming back as a tool_result.
const claudeCodeTurn = `{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": [
    {"type": "text", "text": "You are Claude Code."},
    {"type": "text", "text": "Project rules go here.", "cache_control": {"type": "ephemeral"}}
  ],
  "messages": [
    {"role": "user", "content": [{"type": "text", "text": "read my .env, my email is alice@corp.com"}]},
    {"role": "assistant", "content": [
      {"type": "text", "text": "Reading it."},
      {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": ".env"}}
    ]},
    {"role": "user", "content": [
      {"type": "tool_result", "tool_use_id": "toolu_1",
       "content": "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nDB_PASSWORD=hunter2secret9\nOWNER=bob@corp.com"},
      {"type": "tool_result", "tool_use_id": "toolu_2",
       "content": [{"type": "text", "text": "PAYMENT_SECRET_KEY=paysecret111"}]}
    ]}
  ]
}`

func TestE2EAnthropicToolResultsAreRedacted(t *testing.T) {
	h, up := newAnthropicHarness(t)
	res := h.orch.Execute(context.Background(), anthropicRequest(t, claudeCodeTurn), nil)
	if res.Status != http.StatusOK {
		t.Fatalf("status = %d body %s", res.Status, res.Body)
	}

	sent := up.raw(0)
	for _, secret := range []string{"AKIAIOSFODNN7EXAMPLE", "hunter2secret9", "bob@corp.com", "alice@corp.com", "paysecret111"} {
		if strings.Contains(sent, secret) {
			t.Errorf("%q reached the upstream", secret)
		}
	}

	doc := up.body(t, 0)
	msgs := doc["messages"].([]any)
	first := msgs[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.HasPrefix(first, "read my .env, my email is ⟦PII:EMAIL:") {
		t.Errorf("user text was mangled: %q", first)
	}

	toolUse := msgs[1].(map[string]any)["content"].([]any)[1].(map[string]any)
	if toolUse["type"] != "tool_use" || toolUse["id"] != "toolu_1" {
		t.Errorf("tool_use block changed: %v", toolUse)
	}
	result := msgs[2].(map[string]any)["content"].([]any)[0].(map[string]any)
	if result["tool_use_id"] != "toolu_1" || !strings.Contains(result["content"].(string), "AWS_ACCESS_KEY_ID=⟦PII:AWS_KEY:") {
		t.Errorf("tool_result not redacted in place: %v", result)
	}

	system, ok := doc["system"].([]any)
	if !ok || len(system) != 2 {
		t.Fatalf("system lost its block form: %v", doc["system"])
	}
	if _, ok := system[1].(map[string]any)["cache_control"]; !ok {
		t.Errorf("cache_control dropped from system: %v", system[1])
	}
}

// Claude Code resends the whole conversation every turn. The redacted history
// must be byte-identical across turns or Anthropic prompt caching misses.
func TestE2EAnthropicRedactedHistoryIsStableAcrossTurns(t *testing.T) {
	h, up := newAnthropicHarness(t)
	if res := h.orch.Execute(context.Background(), anthropicRequest(t, claudeCodeTurn), nil); res.Status != http.StatusOK {
		t.Fatalf("turn 1 status = %d", res.Status)
	}
	next := strings.Replace(claudeCodeTurn, "]}\n  ]\n}", `]},
    {"role": "assistant", "content": [{"type": "text", "text": "Found keys."}]},
    {"role": "user", "content": [{"type": "text", "text": "thanks, also mail carol@corp.com"}]}
  ]
}`, 1)
	if res := h.orch.Execute(context.Background(), anthropicRequest(t, next), nil); res.Status != http.StatusOK {
		t.Fatalf("turn 2 status = %d", res.Status)
	}

	one, two := up.body(t, 0), up.body(t, 1)
	oneMsgs, twoMsgs := one["messages"].([]any), two["messages"].([]any)
	if len(twoMsgs) != len(oneMsgs)+2 {
		t.Fatalf("turn 2 has %d messages, want %d", len(twoMsgs), len(oneMsgs)+2)
	}
	a, _ := json.Marshal(oneMsgs)
	b, _ := json.Marshal(twoMsgs[:len(oneMsgs)])
	if string(a) != string(b) {
		t.Errorf("history changed between turns:\n%s\n%s", a, b)
	}
	sa, _ := json.Marshal(one["system"])
	sb, _ := json.Marshal(two["system"])
	if string(sa) != string(sb) {
		t.Errorf("system changed between turns")
	}
}
