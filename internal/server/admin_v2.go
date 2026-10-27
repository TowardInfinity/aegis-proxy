package server

import (
	"net/http"
	"os"
	"sort"
	"strconv"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/budget"
	"guardrail/internal/config"
	"guardrail/internal/security"
)

// signatureVerified reports whether the config bytes on disk matched their
// signature when the server was built. A missing key or a bad signature is
// false. Tamper checking off still lets the process start; /policy reports
// the two facts separately.
func signatureVerified(cfg *config.Config) bool {
	if cfg == nil || cfg.SourcePath == "" || cfg.Security.TamperKeyFile == "" {
		return false
	}
	raw, err := os.ReadFile(cfg.SourcePath)
	if err != nil {
		return false
	}
	pub, err := config.LoadPublicKey(cfg.Security.TamperKeyFile)
	if err != nil {
		return false
	}
	return config.Verify(pub, cfg.SourcePath, raw) == nil
}

func (s *Server) handleTimeseries(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "audit log unavailable", http.StatusInternalServerError)
		return
	}
	minutes := 60
	if v := r.URL.Query().Get("minutes"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			minutes = n
		}
	}
	series, err := audit.Timeseries(s.db, minutes, time.Now())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, series)
}

type budgetKey struct {
	Key         string  `json:"key"`
	TokensToday int     `json:"tokens_today"`
	USDToday    float64 `json:"usd_today"`
	TokenCap    int     `json:"token_cap"`
	USDCap      float64 `json:"usd_cap"`
}

type budgetsView struct {
	Keys []budgetKey `json:"keys"`
}

func (s *Server) handleBudgets(w http.ResponseWriter, r *http.Request) {
	if s.ledger == nil || s.cfg == nil {
		http.Error(w, "budget ledger unavailable", http.StatusInternalServerError)
		return
	}
	// limitsFor applies key_overrides on top of the defaults. A zero cap
	// stays zero, which the dashboard renders as unlimited.
	lim := ledgerAdapter{limits: limitsFrom(s.cfg.Budget), overrides: s.cfg.Budget.KeyOverrides}
	seen := map[string]bool{}
	items := make([]budgetKey, 0)
	for _, sp := range s.ledger.Snapshot() {
		seen[sp.Key] = true
		items = append(items, budgetItem(sp.Key, sp.TokensToday, sp.USDToday, lim.limitsFor(sp.Key)))
	}
	for key := range s.cfg.Budget.KeyOverrides {
		if seen[key] {
			continue
		}
		items = append(items, budgetItem(key, 0, 0, lim.limitsFor(key)))
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Key < items[j].Key })
	writeJSON(w, budgetsView{Keys: items})
}

func budgetItem(key string, tokens int, usd float64, lim budget.Limits) budgetKey {
	return budgetKey{
		Key:         key,
		TokensToday: tokens,
		USDToday:    usd,
		TokenCap:    lim.PerKeyDailyTok,
		USDCap:      lim.PerKeyDailyUSD,
	}
}

// policyView is a whitelist. Route API keys, auth env names, auth headers,
// and the judge credential are not fields here, so they cannot leak into JSON.
type policyView struct {
	Detectors []string           `json:"detectors"`
	Redact    bool               `json:"redact"`
	Response  policyResponseScan `json:"response"`
	Security  policySecurity     `json:"security"`
	Judge     policyJudge        `json:"judge"`
	Budget    policyBudget       `json:"budget"`
	Cache     policyCache        `json:"cache"`
	Routes    []policyRoute      `json:"routes"`
	Tamper    policyTamper       `json:"tamper"`
}

type policyResponseScan struct {
	RedactPII      bool `json:"redact_pii"`
	BlockSecrets   bool `json:"block_secrets"`
	BlockInjection bool `json:"block_injection"`
}

type policySecurity struct {
	Thresholds        map[string]float64 `json:"thresholds"`
	FlagThreshold     float64            `json:"flag_threshold"`
	Monitor           bool               `json:"monitor"`
	MaxBodyBytes      int64              `json:"max_body_bytes"`
	MaxTokens         int                `json:"max_tokens"`
	RateLimitPerMin   int                `json:"rate_limit_per_min"`
	RateLimitPerMinIP int                `json:"rate_limit_per_min_ip"`
}

type policyJudge struct {
	Enabled    bool     `json:"enabled"`
	Model      string   `json:"model"`
	Triggers   []string `json:"triggers"`
	Always     bool     `json:"always"`
	FailClosed bool     `json:"fail_closed"`
	Timeout    string   `json:"timeout"`
}

type policyBudget struct {
	SoftNudge      bool                    `json:"soft_nudge"`
	DailyUSD       float64                 `json:"daily_usd"`
	DailyTokens    int                     `json:"daily_tokens"`
	HourlyTokens   int                     `json:"hourly_tokens"`
	PerKeyDailyUSD float64                 `json:"per_key_daily_usd"`
	PerKeyDailyTok int                     `json:"per_key_daily_tokens"`
	KeyOverrides   map[string]policyKeyCap `json:"key_overrides"`
}

type policyKeyCap struct {
	DailyUSD    float64 `json:"daily_usd"`
	DailyTokens int     `json:"daily_tokens"`
}

type policyCache struct {
	Enabled bool   `json:"enabled"`
	TTL     string `json:"ttl"`
	Size    int    `json:"size"`
}

type policyRoute struct {
	Name   string   `json:"name"`
	Wire   string   `json:"wire"`
	Models []string `json:"models"`
}

type policyTamper struct {
	Enabled           bool `json:"enabled"`
	SignatureVerified bool `json:"signature_verified"`
}

func (s *Server) handlePolicy(w http.ResponseWriter, r *http.Request) {
	if s.cfg == nil {
		http.Error(w, "config unavailable", http.StatusInternalServerError)
		return
	}
	writeJSON(w, policyViewFrom(s.cfg, s.sigVerified))
}

func policyViewFrom(cfg *config.Config, sigOK bool) policyView {
	overrides := map[string]policyKeyCap{}
	for k, v := range cfg.Budget.KeyOverrides {
		overrides[k] = policyKeyCap{DailyUSD: v.DailyUSD, DailyTokens: v.DailyTokens}
	}
	names := make([]string, 0, len(cfg.Routes))
	for name := range cfg.Routes {
		names = append(names, name)
	}
	sort.Strings(names)
	routes := make([]policyRoute, 0, len(names))
	for _, name := range names {
		rc := cfg.Routes[name]
		models := make([]string, 0, len(rc.ModelMap))
		for client := range rc.ModelMap {
			models = append(models, client)
		}
		sort.Strings(models)
		routes = append(routes, policyRoute{Name: name, Wire: rc.Wire, Models: models})
	}
	return policyView{
		Detectors: copyStrings(cfg.PII.Detectors),
		Redact:    cfg.PII.Redact,
		Response: policyResponseScan{
			RedactPII:      cfg.Response.RedactPII,
			BlockSecrets:   cfg.Response.BlockSecrets,
			BlockInjection: cfg.Response.BlockInjection,
		},
		Security: policySecurity{
			Thresholds:        blockThresholds(cfg.Security.Thresholds),
			FlagThreshold:     security.FlagThreshold,
			Monitor:           cfg.Security.Monitor,
			MaxBodyBytes:      cfg.Security.MaxBodyBytes,
			MaxTokens:         cfg.Security.MaxTokens,
			RateLimitPerMin:   cfg.Security.RateLimitPerMin,
			RateLimitPerMinIP: cfg.Security.RateLimitPerIP,
		},
		Judge: policyJudge{
			Enabled:    cfg.Judge.Enabled,
			Model:      cfg.Judge.Model,
			Triggers:   copyStrings(cfg.Judge.Triggers),
			Always:     cfg.Judge.Always,
			FailClosed: cfg.Judge.FailClosed,
			Timeout:    cfg.Judge.Timeout.String(),
		},
		Budget: policyBudget{
			SoftNudge:      cfg.Budget.SoftNudge,
			DailyUSD:       cfg.Budget.DailyUSD,
			DailyTokens:    cfg.Budget.DailyTokens,
			HourlyTokens:   cfg.Budget.HourlyTokens,
			PerKeyDailyUSD: cfg.Budget.PerKeyDailyUSD,
			PerKeyDailyTok: cfg.Budget.PerKeyDailyTok,
			KeyOverrides:   overrides,
		},
		Cache: policyCache{
			Enabled: cfg.Cache.Enabled,
			TTL:     cfg.Cache.TTL.String(),
			Size:    cfg.Cache.Size,
		},
		Routes: routes,
		Tamper: policyTamper{Enabled: cfg.Security.Tamper, SignatureVerified: sigOK},
	}
}

// blockThresholds fills the families the validate stage actually scores.
// A zero in config means the built-in default, matching ScanRequest.
func blockThresholds(cfg map[string]float64) map[string]float64 {
	out := map[string]float64{
		"injection": security.BlockThreshold,
		"jailbreak": security.BlockThreshold,
	}
	for name, v := range cfg {
		if v > 0 {
			out[name] = v
		}
	}
	return out
}

func copyStrings(in []string) []string {
	if len(in) == 0 {
		return []string{}
	}
	return append([]string{}, in...)
}
