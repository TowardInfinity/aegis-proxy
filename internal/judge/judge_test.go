package judge

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestParseVerdict(t *testing.T) {
	cases := []struct {
		in       string
		escalate bool
		wantErr  bool
	}{
		{`{"decision":"allow","category":"code","reason":"generic"}`, false, false},
		{"```json\n{\"decision\": \"ESCALATE\", \"category\": \"m&a\", \"reason\": \"deal terms\"}\n```", true, false},
		{`Sure! {"decision":"escalate","category":"x","reason":"y"} hope that helps`, true, false},
		{`no json here`, false, true},
		{`{"decision":"maybe"}`, false, true},
	}
	for _, c := range cases {
		v, err := parseVerdict(c.in)
		if (err != nil) != c.wantErr {
			t.Errorf("%q: err = %v", c.in, err)
			continue
		}
		if err == nil && v.Escalate != c.escalate {
			t.Errorf("%q: escalate = %v", c.in, v.Escalate)
		}
	}
}

func TestClientCallsOpenAICompatibleEndpointAndCaches(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer k" {
			t.Errorf("path %s auth %q", r.URL.Path, r.Header.Get("Authorization"))
		}
		body, _ := io.ReadAll(r.Body)
		var req struct {
			Model    string                     `json:"model"`
			Messages []struct{ Content string } `json:"messages"`
		}
		_ = json.Unmarshal(body, &req)
		if req.Model != "m" || !strings.Contains(req.Messages[1].Content, "merger with Acme") {
			t.Errorf("unexpected request %s", body)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]string{
			"content": `{"decision":"escalate","category":"m&a","reason":"undisclosed merger"}`,
		}}}})
	}))
	defer srv.Close()

	c := New(srv.URL+"/v1/", "m", "k", "", 2*time.Second)
	for i := 0; i < 2; i++ {
		v, err := c.Judge(context.Background(), "notes on the merger with Acme")
		if err != nil || !v.Escalate || v.Reason != "undisclosed merger" {
			t.Fatalf("verdict %+v err %v", v, err)
		}
		if i == 1 && !v.Cached {
			t.Fatal("second identical call was not served from cache")
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("endpoint called %d times, want 1", calls.Load())
	}
}

func TestClientReportsUpstreamErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = io.WriteString(w, `{"error":"rate limited"}`)
	}))
	defer srv.Close()
	if _, err := New(srv.URL, "m", "", "", time.Second).Judge(context.Background(), "x"); err == nil || !strings.Contains(err.Error(), "429") {
		t.Fatalf("err = %v", err)
	}
}
