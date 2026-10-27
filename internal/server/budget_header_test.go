package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"guardrail/internal/config"
)

func TestDataPlaneBudgetRemainingHeader(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","choices":[{"message":{"role":"assistant","content":"ok"}}],"usage":{"prompt_tokens":11,"completion_tokens":5}}`))
	}))
	t.Cleanup(up.Close)

	t.Setenv("GUARDRAIL_ADMIN_TOKEN", "adm-test")
	cfg := &config.Config{
		Listen:  "127.0.0.1:0",
		Storage: config.StorageConfig{SQLitePath: filepath.Join(t.TempDir(), "guardrail.db")},
		Security: config.SecurityConfig{
			MaxBodyBytes: 1 << 20,
			MaxTokens:    4096,
		},
		PII: config.PIIConfig{Redact: true, Detectors: []string{"email"}, VaultSize: 10},
		Budget: config.BudgetConfig{
			PerKeyDailyTok: 1500,
			Pricing:        map[string]config.PricingConfig{"gpt-4o": {Input: 1, Output: 1}},
		},
		Routes: map[string]config.RouteConfig{
			"openai": {
				Wire: "openai", BaseURL: up.URL + "/v1", Timeout: config.Duration(time.Second),
				ModelMap: map[string]string{"gpt-4o": "gpt-4o"},
			},
		},
	}
	s, err := Build(cfg, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Shutdown(context.Background()) })

	body := `{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}],"max_tokens":32,"temperature":0}`
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer emp")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	est := (len([]rune("user: hello"))+3)/4 + 32
	want := strconv.Itoa(1500 - est)
	if got := rec.Header().Get("X-Guardrail-Budget-Remaining-Tokens"); got != want {
		t.Fatalf("remaining = %q, want %q", got, want)
	}
}

func TestDataPlaneOmitsRemainingWhenUnlimited(t *testing.T) {
	s := newTestServer(t)
	body := `{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}],"max_tokens":8}`
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer emp")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)
	if got := rec.Header().Get("X-Guardrail-Budget-Remaining-Tokens"); got != "" {
		t.Fatalf("unlimited remaining = %q", got)
	}
}
