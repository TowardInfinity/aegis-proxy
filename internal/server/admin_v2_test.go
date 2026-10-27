package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"guardrail/internal/budget"
	"guardrail/internal/config"
	"guardrail/internal/store"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "admin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func adminDo(t *testing.T, h http.Handler, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestP4Routes404WithoutToken(t *testing.T) {
	h := (&Server{cfg: &config.Config{}, adminTok: "tok"}).AdminHandler()
	for _, path := range []string{"/timeseries", "/timeseries?minutes=60", "/budgets", "/policy"} {
		if rec := adminDo(t, h, "", path); rec.Code != http.StatusNotFound {
			t.Fatalf("%s without token: status %d", path, rec.Code)
		}
		if rec := adminDo(t, h, "nope", path); rec.Code != http.StatusNotFound {
			t.Fatalf("%s wrong token: status %d", path, rec.Code)
		}
	}
	// An empty admin token keeps the plane dark even if the caller sends one.
	open := (&Server{cfg: &config.Config{}}).AdminHandler()
	if rec := adminDo(t, open, "anything", "/policy"); rec.Code != http.StatusNotFound {
		t.Fatalf("empty admin token: status %d", rec.Code)
	}
}

func TestTimeseriesRoute(t *testing.T) {
	db := openDB(t)
	now := time.Now().Unix()
	insert := func(ts int64, action string, cost float64) {
		t.Helper()
		if _, err := db.Exec(`INSERT INTO audit (ts, action, stage, cost_usd) VALUES (?, ?, 'test', ?)`, ts, action, cost); err != nil {
			t.Fatal(err)
		}
	}
	insert(now, "pass", 1.5)
	insert(now, "pass", 1.5)
	insert(now, "redact", 0.5)
	insert(now, "block", 0)
	insert(now, "cache_hit", 0)
	insert(now-3*24*3600, "pass", 99) // outside the hour

	s := &Server{cfg: &config.Config{}, db: db, adminTok: "tok"}
	h := s.AdminHandler()
	var series struct {
		BucketSec int `json:"bucket_sec"`
		Points    []struct {
			T        int64   `json:"t"`
			Pass     int     `json:"pass"`
			Redact   int     `json:"redact"`
			Block    int     `json:"block"`
			CacheHit int     `json:"cache_hit"`
			USD      float64 `json:"usd"`
		} `json:"points"`
	}
	rec := adminDo(t, h, "tok", "/timeseries?minutes=60")
	if err := json.Unmarshal(rec.Body.Bytes(), &series); rec.Code != http.StatusOK || err != nil {
		t.Fatalf("status %d err %v body %s", rec.Code, err, rec.Body.String())
	}
	if series.BucketSec != 60 || len(series.Points) != 60 {
		t.Fatalf("bucket %d len %d", series.BucketSec, len(series.Points))
	}
	var pass, redact, block, cache int
	var usd float64
	zeros := 0
	for i, p := range series.Points {
		if i > 0 && p.T != series.Points[i-1].T+60 {
			t.Fatalf("gap at %d: %d then %d", i, series.Points[i-1].T, p.T)
		}
		pass += p.Pass
		redact += p.Redact
		block += p.Block
		cache += p.CacheHit
		usd += p.USD
		if p.Pass == 0 && p.Redact == 0 && p.Block == 0 && p.CacheHit == 0 && p.USD == 0 {
			zeros++
		}
	}
	if pass != 2 || redact != 1 || block != 1 || cache != 1 || math.Abs(usd-3.5) > 1e-9 {
		t.Fatalf("sums pass=%d redact=%d block=%d cache=%d usd=%v", pass, redact, block, cache, usd)
	}
	if zeros == 0 {
		t.Fatal("expected empty buckets in the hour")
	}

	rec = adminDo(t, h, "tok", "/timeseries?minutes=100000")
	series = struct {
		BucketSec int `json:"bucket_sec"`
		Points    []struct {
			T        int64   `json:"t"`
			Pass     int     `json:"pass"`
			Redact   int     `json:"redact"`
			Block    int     `json:"block"`
			CacheHit int     `json:"cache_hit"`
			USD      float64 `json:"usd"`
		} `json:"points"`
	}{}
	if err := json.Unmarshal(rec.Body.Bytes(), &series); err != nil || len(series.Points) != 1440 {
		t.Fatalf("cap status %d len %d err %v", rec.Code, len(series.Points), err)
	}
	rec = adminDo(t, h, "tok", "/timeseries?minutes=abc")
	if err := json.Unmarshal(rec.Body.Bytes(), &series); err != nil || len(series.Points) != 60 {
		t.Fatalf("bad minutes len %d err %v", len(series.Points), err)
	}
}

func TestBudgetsRouteReflectsOverride(t *testing.T) {
	db := openDB(t)
	led := budget.NewLedger(db, map[string]budget.Pricing{"gpt-4o": {Input: 1000, Output: 1000}})
	led.Record("emp-alice", "gpt-4o", 500, 0)
	led.Record("emp-intern", "gpt-4o", 1000, 0)
	s := &Server{
		cfg: &config.Config{Budget: config.BudgetConfig{
			PerKeyDailyUSD: 10,
			PerKeyDailyTok: 0,
			KeyOverrides: map[string]config.KeyBudget{
				"emp-intern": {DailyTokens: 1500},
				"emp-quiet":  {DailyUSD: 2},
			},
		}},
		db:       db,
		ledger:   led,
		adminTok: "tok",
	}
	rec := adminDo(t, s.AdminHandler(), "tok", "/budgets")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "TokensToday") {
		t.Fatalf("response used Go field names: %s", rec.Body.String())
	}
	var body struct {
		Keys []budgetKey `json:"keys"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Keys) != 3 {
		t.Fatalf("keys = %+v", body.Keys)
	}
	want := map[string]budgetKey{
		"emp-alice":  {Key: "emp-alice", TokensToday: 500, USDToday: 0.5, TokenCap: 0, USDCap: 10},
		"emp-intern": {Key: "emp-intern", TokensToday: 1000, USDToday: 1, TokenCap: 1500, USDCap: 10},
		"emp-quiet":  {Key: "emp-quiet", TokensToday: 0, USDToday: 0, TokenCap: 0, USDCap: 2},
	}
	for i, got := range body.Keys {
		g, ok := want[got.Key]
		if !ok {
			t.Fatalf("unexpected key %q", got.Key)
		}
		if i > 0 && body.Keys[i-1].Key > got.Key {
			t.Fatalf("keys not sorted: %+v", body.Keys)
		}
		if got.TokensToday != g.TokensToday || got.TokenCap != g.TokenCap || got.USDCap != g.USDCap || math.Abs(got.USDToday-g.USDToday) > 1e-9 {
			t.Fatalf("%s = %+v, want %+v", got.Key, got, g)
		}
	}
}

func TestPolicyOmitsSecrets(t *testing.T) {
	const routeSecret = "sk-live-DO-NOT-LEAK-9f3a7c"
	const judgeSecret = "judge-secret-DO-NOT-LEAK-bb12"
	s := &Server{
		adminTok:    "tok",
		sigVerified: true,
		cfg: &config.Config{
			SourcePath: "/tmp/secret-config-path.yaml",
			Routes: map[string]config.RouteConfig{
				"openai": {
					Wire:       "openai",
					BaseURL:    "https://route-secret-host.example/v1",
					AuthEnv:    "OPENAI_API_KEY_DO_NOT_LEAK",
					APIKey:     routeSecret,
					AuthHeader: "bearer",
					ModelMap:   map[string]string{"client-visible": "upstream-HIDDEN-model"},
				},
			},
			Security: config.SecurityConfig{
				Tamper:          true,
				TamperKeyFile:   "super-secret-key-path.pub",
				Thresholds:      map[string]float64{"injection": 0.91},
				Monitor:         true,
				MaxBodyBytes:    2048,
				MaxTokens:       100,
				RateLimitPerMin: 30,
				RateLimitPerIP:  40,
			},
			PII: config.PIIConfig{Redact: true, Detectors: []string{"email", "generic_secret"}},
			Response: config.ResponseConfig{
				RedactPII:    true,
				BlockSecrets: true,
			},
			Judge: config.JudgeConfig{
				Enabled:    true,
				Model:      "gemma-judge",
				BaseURL:    "https://judge-secret-host.example/v1",
				APIKey:     judgeSecret,
				AuthEnv:    "JUDGE_KEY_DO_NOT_LEAK",
				Policy:     "zz-policy-DO-NOT-LEAK",
				Triggers:   []string{"forecast", "merger"},
				Always:     true,
				FailClosed: true,
				Timeout:    config.Duration(5 * time.Second),
			},
			Budget: config.BudgetConfig{
				SoftNudge:      true,
				DailyUSD:       50,
				PerKeyDailyUSD: 10,
				PerKeyDailyTok: 400000,
				KeyOverrides:   map[string]config.KeyBudget{"emp-intern": {DailyTokens: 1500}},
			},
			Cache: config.CacheConfig{Enabled: true, TTL: config.Duration(time.Hour), Size: 50},
		},
	}
	rec := adminDo(t, s.AdminHandler(), "tok", "/policy")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, secret := range []string{
		routeSecret, judgeSecret, "upstream-HIDDEN-model", "route-secret-host",
		"judge-secret-host", "DO-NOT-LEAK", "super-secret-key-path", "secret-config-path",
		"zz-policy", "api_key", "auth_env", "auth_header", "base_url",
	} {
		if strings.Contains(body, secret) {
			t.Fatalf("policy JSON contains %q\n%s", secret, body)
		}
	}
	var view policyView
	if err := json.Unmarshal(rec.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if !view.Redact || len(view.Detectors) != 2 || view.Detectors[0] != "email" {
		t.Fatalf("detectors = %+v redact %v", view.Detectors, view.Redact)
	}
	if !view.Response.BlockSecrets || view.Response.BlockInjection {
		t.Fatalf("response = %+v", view.Response)
	}
	if math.Abs(view.Security.Thresholds["injection"]-0.91) > 1e-9 || math.Abs(view.Security.Thresholds["jailbreak"]-0.8) > 1e-9 {
		t.Fatalf("thresholds = %+v", view.Security.Thresholds)
	}
	if !view.Security.Monitor || view.Security.RateLimitPerMin != 30 {
		t.Fatalf("security = %+v", view.Security)
	}
	if !view.Judge.Enabled || view.Judge.Model != "gemma-judge" || !view.Judge.FailClosed || !view.Judge.Always || view.Judge.Timeout != "5s" {
		t.Fatalf("judge = %+v", view.Judge)
	}
	if len(view.Judge.Triggers) != 2 || view.Judge.Triggers[0] != "forecast" {
		t.Fatalf("triggers = %+v", view.Judge.Triggers)
	}
	if view.Budget.KeyOverrides["emp-intern"].DailyTokens != 1500 || view.Budget.PerKeyDailyTok != 400000 {
		t.Fatalf("budget = %+v", view.Budget)
	}
	if len(view.Routes) != 1 || view.Routes[0].Name != "openai" || view.Routes[0].Wire != "openai" {
		t.Fatalf("routes = %+v", view.Routes)
	}
	if len(view.Routes[0].Models) != 1 || view.Routes[0].Models[0] != "client-visible" {
		t.Fatalf("models = %+v", view.Routes[0].Models)
	}
	if !view.Tamper.Enabled || !view.Tamper.SignatureVerified {
		t.Fatalf("tamper = %+v", view.Tamper)
	}
	if !view.Cache.Enabled || view.Cache.TTL != "1h0m0s" || view.Cache.Size != 50 {
		t.Fatalf("cache = %+v", view.Cache)
	}
}

func TestSignatureVerifiedAtStartup(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.yaml")
	if err := os.WriteFile(path, []byte("listen: \":0\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	pub, err := config.Sign(filepath.Join(dir, "k.priv"), path)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{SourcePath: path, Security: config.SecurityConfig{TamperKeyFile: pub}}
	if !signatureVerified(cfg) {
		t.Fatal("signed file did not verify")
	}
	if err := os.WriteFile(path, []byte("listen: \":1\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if signatureVerified(cfg) {
		t.Fatal("tampered file verified")
	}
	cfg.Security.TamperKeyFile = ""
	if signatureVerified(cfg) {
		t.Fatal("missing key verified")
	}
}

func TestBuildRecordsSignature(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "proxy.yaml")
	if err := os.WriteFile(path, []byte("signed-bytes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	pub, err := config.Sign(filepath.Join(dir, "k.priv"), path)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		SourcePath: path,
		Security:   config.SecurityConfig{Tamper: true, TamperKeyFile: pub},
		Storage:    config.StorageConfig{SQLitePath: filepath.Join(dir, "a.db")},
	}
	s, err := Build(cfg, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Shutdown(context.Background()) })
	if !s.sigVerified {
		t.Fatal("Build did not record a verified signature")
	}

	if err := os.WriteFile(path, []byte("tampered-bytes\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg.Storage.SQLitePath = filepath.Join(dir, "b.db")
	s2, err := Build(cfg, false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s2.Shutdown(context.Background()) })
	if s2.sigVerified {
		t.Fatal("Build recorded a tampered file as verified")
	}
}

func TestDashboardP4Markup(t *testing.T) {
	rec := adminDo(t, (&Server{}).AdminHandler(), "", "/dashboard")
	if rec.Code != http.StatusOK {
		t.Fatalf("dashboard status %d", rec.Code)
	}
	if csp := rec.Header().Get("Content-Security-Policy"); csp != "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" {
		t.Fatalf("csp = %q", csp)
	}
	body := rec.Body.String()
	for _, want := range []string{
		`data-tab="usage" data-title="Usage" data-ready`,
		`data-tab="policy" data-title="Policy" data-ready`,
		"Export CSV",
		">All<", ">Redacted<", ">Blocked<", ">Held<", ">Cache<",
		"latency_ms", "request_id", "new Blob",
		"/* P4 usage and policy */",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("dashboard missing %q", want)
		}
	}
	for _, banned := range []string{"window.alert", "window.confirm", "window.prompt", "alert(", "confirm(", "<script src", "https://"} {
		if strings.Contains(body, banned) {
			t.Fatalf("dashboard contains %q", banned)
		}
	}
}
