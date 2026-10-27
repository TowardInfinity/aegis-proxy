package route

import (
	"testing"

	"guardrail/internal/wire"
)

func TestAuthTokenPrefersEnvThenInlineKey(t *testing.T) {
	a := NewAdapter(Route{Name: "r", Wire: "openai", AuthEnv: "ROUTE_TEST_KEY", APIKey: "inline"})
	if got := a.AuthToken(); got != "inline" {
		t.Fatalf("unset env: got %q, want inline key", got)
	}
	t.Setenv("ROUTE_TEST_KEY", "from-env")
	if got := a.AuthToken(); got != "from-env" {
		t.Fatalf("set env: got %q", got)
	}
}

func TestAuthHeader(t *testing.T) {
	req, err := wire.ParseAnthropic([]byte(`{"model":"m","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		header, wantKey, wantBearer string
	}{
		{"", "k", ""},
		{"x-api-key", "k", ""},
		{"bearer", "", "Bearer k"},
	}
	for _, c := range cases {
		a := NewAdapter(Route{Name: "r", Wire: "anthropic", BaseURL: "http://x", APIKey: "k", AuthHeader: c.header})
		u, err := a.Prepare(req)
		if err != nil {
			t.Fatal(err)
		}
		if u.Headers["x-api-key"] != c.wantKey || u.Headers["Authorization"] != c.wantBearer || u.Headers["anthropic-version"] == "" {
			t.Errorf("auth_header %q: headers %v", c.header, u.Headers)
		}
	}
}
