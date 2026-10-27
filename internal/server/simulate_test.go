package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"guardrail/internal/audit"
)

func TestSimulateRequiresAdminToken(t *testing.T) {
	s := newTestServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/simulate", strings.NewReader(`{"text":"hello"}`))
	s.AdminHandler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "404 page not found") {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestSimulateRejectsOversize(t *testing.T) {
	s := newTestServer(t)
	rec := httptest.NewRecorder()
	body := `{"text":"` + strings.Repeat("a", simulateMax) + `"}`
	s.AdminHandler().ServeHTTP(rec, adminReq(http.MethodPost, "/simulate", body))
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
}

func TestSimulateRedactsAndWritesNothing(t *testing.T) {
	s := newTestServer(t)
	const secret = "jane.doe@example.com"
	rec := httptest.NewRecorder()
	s.AdminHandler().ServeHTTP(rec, adminReq(http.MethodPost, "/simulate", `{"text":"mail `+secret+` please"}`))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body.String())
	}
	got := rec.Body.String()
	if strings.Contains(got, secret) || !strings.Contains(got, "⟦PII:EMAIL:") || !strings.Contains(got, `"decision":"redact"`) {
		t.Fatalf("body = %s", got)
	}
	s.audit.Flush()
	rows, err := audit.Recent(s.DB(), 20)
	if err != nil || len(rows) != 0 {
		t.Fatalf("audit rows = %d err %v", len(rows), err)
	}
	items, err := s.held.List("all")
	if err != nil || len(items) != 0 {
		t.Fatalf("held = %v err %v", items, err)
	}
}
