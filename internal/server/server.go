// Package server wires the config into an orchestrator and exposes the data
// plane and the admin plane as two separate HTTP servers.
package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/budget"
	"guardrail/internal/cache"
	"guardrail/internal/config"
	"guardrail/internal/dlp"
	"guardrail/internal/judge"
	"guardrail/internal/pipeline"
	"guardrail/internal/route"
	"guardrail/internal/security"
	"guardrail/internal/store"
	"guardrail/internal/wire"
)

// AdminAddr is where the admin plane listens. It never leaves loopback.
const AdminAddr = "127.0.0.1:8081"

// AdminListenAddr lets a host that has 8081 taken move the admin plane without
// a rebuild. The default stays as designed.
func AdminListenAddr() string {
	if v := os.Getenv("GUARDRAIL_ADMIN_ADDR"); v != "" {
		return v
	}
	return AdminAddr
}

// Server owns both listeners and every long-lived dependency.
type Server struct {
	cfg      *config.Config
	db       *sql.DB
	audit    *audit.Logger
	cache    *cache.Cache
	ledger   *budget.Ledger
	orch     *pipeline.Orchestrator
	router   map[string]*route.Adapter
	limiter  *security.Limiter
	dev      bool
	devLog   *log.Logger
	adminTok string
}

// Build constructs the server and its dependencies. The caller owns the DB.
func Build(cfg *config.Config, dev bool) (*Server, error) {
	db, err := store.Open(cfg.Storage.SQLitePath)
	if err != nil {
		return nil, err
	}
	pricing := map[string]budget.Pricing{}
	for m, p := range cfg.Budget.Pricing {
		pricing[strings.ToLower(m)] = budget.Pricing{Input: p.Input, Output: p.Output}
	}
	ledger := budget.NewLedger(db, pricing)
	c := cache.New(db, cfg.Cache.Size, cfg.Cache.TTL.Std())
	au := audit.New(db)
	detectors := dlp.Detectors(cfg.PII.Detectors)
	vault := dlp.NewVault(cfg.PII.VaultTTL.Std(), cfg.PII.VaultSize)
	adapters := map[string]*route.Adapter{}
	for name, rc := range cfg.Routes {
		adapters[name] = route.NewAdapter(route.Route{
			Name:       name,
			Wire:       rc.Wire,
			BaseURL:    rc.BaseURL,
			AuthEnv:    rc.AuthEnv,
			APIKey:     rc.APIKey,
			AuthHeader: rc.AuthHeader,
			ModelMap:   rc.ModelMap,
			Timeout:    rc.Timeout.Std(),
			Retries:    2,
		})
	}
	limiter := security.NewLimiter(cfg.Security.RateLimitPerMin, cfg.Security.RateLimitPerIP)

	s := &Server{
		cfg:      cfg,
		db:       db,
		audit:    au,
		cache:    c,
		ledger:   ledger,
		router:   adapters,
		limiter:  limiter,
		dev:      dev,
		devLog:   log.New(os.Stderr, "", 0),
		adminTok: os.Getenv("GUARDRAIL_ADMIN_TOKEN"),
	}
	s.orch = pipeline.New(pipeline.Config{
		MaxBodyBytes:           cfg.Security.MaxBodyBytes,
		MaxTokens:              cfg.Security.MaxTokens,
		Thresholds:             cfg.Security.Thresholds,
		Monitor:                cfg.Security.Monitor,
		Redact:                 cfg.PII.Redact,
		Detectors:              detectors,
		Vault:                  vault,
		CacheEnabled:           cfg.Cache.Enabled,
		ResponseRedactPII:      cfg.Response.RedactPII,
		ResponseBlockSecrets:   cfg.Response.BlockSecrets,
		ResponseBlockInjection: cfg.Response.BlockInjection,
		Encoding:               wire.Encoder{},
		RouteFor: func(name string) (pipeline.Adapter, bool) {
			a, ok := adapters[name]
			if !ok {
				return nil, false
			}
			return a, true
		},
		Audit:           au,
		Judge:           judgeFrom(cfg.Judge),
		JudgeTriggers:   cfg.Judge.Triggers,
		JudgeAlways:     cfg.Judge.Always,
		JudgeFailClosed: cfg.Judge.FailClosed,
	}, c, ledgerAdapter{ledger: ledger, limits: limitsFrom(cfg.Budget)}, limiter)
	return s, nil
}

// judgeFrom returns nil when the judge is off, which disables the stage.
func judgeFrom(j config.JudgeConfig) pipeline.Judge {
	if !j.Enabled {
		return nil
	}
	timeout := j.Timeout.Std()
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	key := j.APIKey
	if j.AuthEnv != "" {
		if v := os.Getenv(j.AuthEnv); v != "" {
			key = v
		}
	}
	return judge.New(j.BaseURL, j.Model, key, j.Policy, timeout)
}

// ledgerAdapter binds the configured limits to the checks the pipeline makes,
// so the orchestrator never needs to know about budget config.
type ledgerAdapter struct {
	ledger *budget.Ledger
	limits budget.Limits
}

func (l ledgerAdapter) Check(key string, estimated int, now time.Time) (bool, string, bool) {
	return l.ledger.Check(key, l.limits, estimated, now)
}

func (l ledgerAdapter) Record(key, model string, input, output int) float64 {
	return l.ledger.Record(key, model, input, output)
}

func (l ledgerAdapter) Price(model string) (float64, float64) {
	return l.ledger.Price(model)
}

func limitsFrom(b config.BudgetConfig) budget.Limits {
	return budget.Limits{
		PerKeyDailyUSD: b.PerKeyDailyUSD,
		PerKeyDailyTok: b.PerKeyDailyTok,
		HourlyTok:      b.HourlyTokens,
		GlobalDailyUSD: b.DailyUSD,
		SoftNudge:      b.SoftNudge,
	}
}

// DB exposes the handle for the stats CLI and tests.
func (s *Server) DB() *sql.DB { return s.db }

// Orchestrator exposes the pipeline for tests.
func (s *Server) Orchestrator() *pipeline.Orchestrator { return s.orch }

// Handler returns the data plane.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/chat/completions", s.guard("/v1/chat/completions", s.handleChat))
	mux.HandleFunc("/v1/completions", s.guard("/v1/completions", s.handleCompletions))
	mux.HandleFunc("/v1/embeddings", s.guard("/v1/embeddings", s.handleEmbeddings))
	mux.HandleFunc("/v1/messages", s.guard("/v1/messages", s.handleMessages))
	mux.HandleFunc("/v1/messages/count_tokens", s.guard("/v1/messages/count_tokens", s.handleCountTokens))
	mux.HandleFunc("/v1/models", s.guard("/v1/models", s.handleModels))
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	return withNotFound(mux)
}

// AdminHandler returns the admin plane. Every route 404s without a valid
// bearer token, which is the behavior DESIGN.md asks for: the port should not
// even acknowledge that it is an admin surface.
func (s *Server) AdminHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/stats", s.admin(func(w http.ResponseWriter, r *http.Request) {
		stats, err := audit.Aggregate(s.db)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, stats)
	}))
	mux.HandleFunc("/ledger", s.admin(func(w http.ResponseWriter, r *http.Request) {
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			fmt.Sscanf(v, "%d", &limit)
		}
		rows, err := audit.Recent(s.db, limit)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"rows": rows})
	}))
	return withNotFound(mux)
}

func (s *Server) admin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.adminTok == "" || r.Header.Get("Authorization") != "Bearer "+s.adminTok {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		next(w, r)
	}
}

// guard centralizes the boundary checks every data-plane route needs: method,
// body size, route resolution, and the access log.
func (s *Server) guard(path string, next func(http.ResponseWriter, *http.Request) pipeline.Result) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		if r.Method != http.MethodPost && path != "/v1/models" {
			http.Error(sw, "method not allowed", http.StatusMethodNotAllowed)
			s.accessLog(r, sw.status, start, nil)
			return
		}
		if r.Method != http.MethodGet && path == "/v1/models" {
			http.Error(sw, "method not allowed", http.StatusMethodNotAllowed)
			s.accessLog(r, sw.status, start, nil)
			return
		}
		r.Body = http.MaxBytesReader(sw, r.Body, s.cfg.Security.MaxBodyBytes)
		res := next(sw, r)
		if res.Headers != nil {
			for k, v := range res.Headers {
				if k != "X-Guardrail-Action" && k != "X-Guardrail-Stage" {
					sw.Header().Set(k, v)
				}
			}
		}
		// The pipeline wrote its headers into res.Headers before it streamed;
		// copy them now for the buffered path.
		for _, k := range []string{"X-Guardrail-Action", "X-Guardrail-Stage", "X-Guardrail-Cache", "X-Guardrail-Budget"} {
			if v, ok := res.Headers[k]; ok && sw.Header().Get(k) == "" {
				sw.Header().Set(k, v)
			}
		}
		if res.Body != nil {
			if sw.Header().Get("Content-Type") == "" {
				sw.Header().Set("Content-Type", "application/json")
			}
			sw.WriteHeader(res.Status)
			_, _ = sw.Write(res.Body)
		}
		s.accessLog(r, sw.status, start, res.Headers)
	}
}

func (s *Server) accessLog(r *http.Request, status int, start time.Time, h map[string]string) {
	if !s.dev || s.devLog == nil {
		return
	}
	action := ""
	if h != nil {
		action = h["X-Guardrail-Action"]
	}
	s.devLog.Printf("%s %s %d %s action=%s", r.Method, r.URL.Path, status, time.Since(start).Round(time.Millisecond), action)
}

type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *statusWriter) WriteHeader(status int) {
	if !w.wrote {
		w.status = status
		w.wrote = true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.wrote = true
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// withNotFound makes unknown paths 404 explicitly instead of the mux's
// redirect-to-slash behavior.
func withNotFound(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if pattern == "" {
			http.NotFound(w, r)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// Run starts both servers and blocks until ctx is canceled.
func (s *Server) Run(ctx context.Context) error {
	dataSrv := &http.Server{Addr: s.cfg.Listen, Handler: s.Handler(), ReadHeaderTimeout: 10 * time.Second}
	adminSrv := &http.Server{Addr: AdminListenAddr(), Handler: s.AdminHandler(), ReadHeaderTimeout: 10 * time.Second}

	errc := make(chan error, 2)
	go func() {
		if err := s.listen(dataSrv); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- fmt.Errorf("data plane: %w", err)
		}
	}()
	go func() {
		if err := s.listen(adminSrv); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errc <- fmt.Errorf("admin plane: %w", err)
		}
	}()

	stopSweeper := time.NewTicker(time.Minute)
	defer stopSweeper.Stop()
	go func() {
		for range stopSweeper.C {
			s.cache.SweepExpired()
			s.limiter.Purge()
		}
	}()

	select {
	case <-ctx.Done():
	case err := <-errc:
		s.Shutdown(context.Background())
		return err
	}
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.Shutdown(shutCtx)
}

func (s *Server) listen(srv *http.Server) error {
	if srv.Addr == AdminListenAddr() {
		// The admin plane never leaves loopback.
		return srv.ListenAndServe()
	}
	if s.cfg.TLS.CertFile != "" && s.cfg.TLS.KeyFile != "" {
		return srv.ListenAndServeTLS(s.cfg.TLS.CertFile, s.cfg.TLS.KeyFile)
	}
	return srv.ListenAndServe()
}

// Shutdown flushes the audit log and closes the DB.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.audit != nil {
		s.audit.Close()
	}
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}
