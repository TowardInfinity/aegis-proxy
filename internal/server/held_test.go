package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"guardrail/internal/config"
	"guardrail/internal/pipeline"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	t.Setenv("GUARDRAIL_ADMIN_TOKEN", "adm-test")
	cfg := &config.Config{
		Listen:  "127.0.0.1:0",
		Storage: config.StorageConfig{SQLitePath: filepath.Join(t.TempDir(), "guardrail.db")},
		Security: config.SecurityConfig{
			MaxBodyBytes: 1 << 20,
			MaxTokens:    4096,
		},
		PII: config.PIIConfig{Redact: true, Detectors: []string{"email"}, VaultSize: 10},
		Routes: map[string]config.RouteConfig{
			"openai": {Wire: "openai", BaseURL: "http://127.0.0.1:9", Timeout: config.Duration(time.Second), ModelMap: map[string]string{"gpt-4o": "gpt-4o"}},
		},
	}
	s, err := Build(cfg, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Shutdown(context.Background()) })
	return s
}

func adminReq(method, path, body string) *http.Request {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	r.Header.Set("Authorization", "Bearer adm-test")
	return r
}

func TestHeldRoutesRequireAdminToken(t *testing.T) {
	s := newTestServer(t)
	h := s.AdminHandler()
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/held"},
		{http.MethodPost, "/held/SEC-ABCDEF01/approve"},
		{http.MethodPost, "/held/SEC-ABCDEF01/reject"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{}`))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s without token = %d", tc.method, tc.path, rec.Code)
		}
	}
}

func TestHeldApproveAndDoubleDecide(t *testing.T) {
	s := newTestServer(t)
	const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if _, err := s.held.Add(pipeline.Held{
		Hash: hash, Ticket: "SEC-ABCDEF01", Key: "emp-a", Category: "financials",
		Reason: "forecast", Status: pipeline.HeldPending, CreatedAt: time.Now().UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	h := s.AdminHandler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, adminReq(http.MethodGet, "/held", ""))
	if rec.Code != http.StatusOK {
		t.Fatalf("list = %d %s", rec.Code, rec.Body)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte(hash)) {
		t.Fatalf("list returned the content hash: %s", rec.Body)
	}
	var listed struct {
		Items []heldView `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Items) != 1 || listed.Items[0].Ticket != "SEC-ABCDEF01" || listed.Items[0].Key != "emp-a" {
		t.Fatalf("items = %+v", listed.Items)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, adminReq(http.MethodPost, "/held/SEC-ABCDEF01/approve", `{"note":"released"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d %s", rec.Code, rec.Body)
	}
	var decided heldView
	if err := json.Unmarshal(rec.Body.Bytes(), &decided); err != nil {
		t.Fatal(err)
	}
	if decided.Status != pipeline.HeldApproved || decided.DecidedBy != "secops" || decided.Note != "released" {
		t.Fatalf("decided = %+v", decided)
	}
	if bytes.Contains(rec.Body.Bytes(), []byte(hash)) {
		t.Fatalf("approve returned the hash: %s", rec.Body)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, adminReq(http.MethodPost, "/held/SEC-ABCDEF01/reject", `{"reviewer":"ada"}`))
	if rec.Code != http.StatusConflict {
		t.Fatalf("second decide = %d %s", rec.Code, rec.Body)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, adminReq(http.MethodPost, "/held/SEC-NOPE0000/approve", `{}`))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown ticket = %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, adminReq(http.MethodGet, "/held?status=pending", ""))
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Items) != 0 {
		t.Fatalf("pending after approve = %+v", listed.Items)
	}
}

func TestEmployeeTicketIsScopedToKey(t *testing.T) {
	s := newTestServer(t)
	if _, err := s.held.Add(pipeline.Held{
		Hash: "aa", Ticket: "SEC-TICKET01", Key: "emp-a", Reason: "forecast",
		Status: pipeline.HeldPending, CreatedAt: 10,
	}); err != nil {
		t.Fatal(err)
	}
	h := s.Handler()

	own := httptest.NewRequest(http.MethodGet, "/v1/tickets/SEC-TICKET01", nil)
	own.Header.Set("Authorization", "Bearer emp-a")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, own)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner = %d %s", rec.Code, rec.Body)
	}
	var view struct {
		Ticket string `json:"ticket"`
		Status string `json:"status"`
		Reason string `json:"reason"`
		Key    string `json:"key"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if view.Ticket != "SEC-TICKET01" || view.Status != pipeline.HeldPending || view.Reason != "forecast" || view.Key != "" {
		t.Fatalf("view = %+v body %s", view, rec.Body)
	}

	other := httptest.NewRequest(http.MethodGet, "/v1/tickets/SEC-TICKET01", nil)
	other.Header.Set("Authorization", "Bearer emp-b")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, other)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("other employee = %d %s", rec.Code, rec.Body)
	}
	if _, err := s.held.Add(pipeline.Held{
		Hash: "bb", Ticket: "SEC-ANON0001", Key: "anonymous", Status: pipeline.HeldPending, CreatedAt: 11,
	}); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/tickets/SEC-ANON0001", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("keyless caller = %d %s", rec.Code, rec.Body)
	}
}
