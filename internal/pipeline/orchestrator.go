package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"guardrail/internal/audit"
	"guardrail/internal/cache"
	"guardrail/internal/dlp"
	"guardrail/internal/security"
)

// Cache is the surface the orchestrator needs from the response cache.
type Cache interface {
	Get(key string) (body []byte, status int, ok bool)
	Put(key string, status int, body []byte) error
}

// Upstream is a prepared outbound request. route builds it; pipeline only
// forwards it, which keeps the HTTP adapter below the orchestrator in the
// dependency graph.
type Upstream struct {
	URL     string
	Headers map[string]string
	Body    []byte
	Stream  bool
}

// Adapter maps one normalized request onto one provider and sends it.
type Adapter interface {
	Prepare(*Request) (*Upstream, error)
	Do(ctx context.Context, u *Upstream) (*http.Response, error)
}

// Encoder is the wire-format surface. wire implements it; pipeline calls it.
type Encoder interface {
	ErrorBody(shape Shape, message, typ string) []byte
	ResponseText(shape Shape, raw []byte) string
	EncodeResponse(shape Shape, raw []byte, stored string, rewrite func(string) string) ([]byte, int, int, error)
}

// Ledger is the surface the orchestrator needs from budget enforcement.
type Ledger interface {
	Check(key string, estimated int, now time.Time) (exceeded bool, reason string, nudge bool)
	Record(key, model string, input, output int) float64
	Price(model string) (in, out float64)
}

// Config is the resolved policy the orchestrator applies. The server builds it
// once at startup from the YAML config.
type Config struct {
	MaxBodyBytes int64
	MaxTokens    int
	Thresholds   map[string]float64
	Monitor      bool

	Redact    bool
	Detectors []dlp.Detector
	Vault     *dlp.Vault

	CacheEnabled bool

	ResponseRedactPII      bool
	ResponseBlockSecrets   bool
	ResponseBlockInjection bool

	RouteFor func(name string) (Adapter, bool)
	Encoding Encoder
	Audit    *audit.Logger
}

// Orchestrator runs the stages in DESIGN.md order.
type Orchestrator struct {
	cfg      Config
	cache    Cache
	ledger   Ledger
	detector *security.Detector
	limiter  *security.Limiter
}

// New wires the orchestrator. cache and ledger may be nil when the feature is
// disabled; every stage checks before use.
func New(cfg Config, c Cache, ledger Ledger, limiter *security.Limiter) *Orchestrator {
	return &Orchestrator{cfg: cfg, cache: c, ledger: ledger, detector: security.NewDetector(), limiter: limiter}
}

// run is the mutable per-request state. One struct means each stage reads and
// writes one place instead of threading six return values.
type run struct {
	req       *Request
	dec       Decision
	start     time.Time
	body      []byte
	status    int
	headers   map[string]string
	inputTok  int
	outputTok int
	cost      float64
	cacheKey  string
	shape     Shape
}

// Execute runs the pipeline for one request. sink is non-nil for a streaming
// request; the orchestrator writes SSE chunks to it directly.
func (o *Orchestrator) Execute(ctx context.Context, req *Request, sink ResponseSink) Result {
	shape := req.Shape
	if shape == "" {
		shape = ShapeChat
	}
	r := &run{
		req:     req,
		start:   time.Now(),
		shape:   shape,
		headers: map[string]string{},
		dec:     Decision{Action: ActionPass, Stage: StageValidate},
	}
	defer o.finish(r)

	if res, stop := o.stageValidate(r); stop {
		return res
	}
	if res, stop := o.stageRedact(r); stop {
		return res
	}
	if res, stop := o.stageCache(r); stop {
		return res
	}
	if res, stop := o.stageBudget(r); stop {
		return res
	}
	return o.stageUpstream(ctx, r, sink)
}

// finish writes the audit row and fills the standard headers.
func (o *Orchestrator) finish(r *run) {
	r.headers["X-Guardrail-Action"] = string(r.dec.Action)
	if r.dec.Stage != "" {
		r.headers["X-Guardrail-Stage"] = r.dec.Stage
	}
	if o.cfg.Audit == nil {
		return
	}
	o.cfg.Audit.Write(audit.Row{
		TS:           r.start,
		Key:          r.req.Key,
		Route:        r.req.Route,
		Model:        r.req.Model,
		Action:       string(r.dec.Action),
		Stage:        r.dec.Stage,
		RuleHits:     auditHits(r.dec.RuleHits),
		LatencyMS:    time.Since(r.start).Milliseconds(),
		InputTokens:  r.inputTok,
		OutputTokens: r.outputTok,
		CostUSD:      r.cost,
		CacheHit:     r.dec.Action == ActionCacheHit,
		SavedTokens:  savedTokens(r),
		SavedUSD:     savedUSD(r),
	})
}

func savedTokens(r *run) int {
	if r.dec.Action != ActionCacheHit {
		return 0
	}
	return r.dec.EstimatedTokens
}

func savedUSD(r *run) float64 {
	if r.dec.Action != ActionCacheHit {
		return 0
	}
	return r.cost
}

func (o *Orchestrator) fail(r *run, status int, action Action, stage, reason string) Result {
	r.dec.Action = action
	r.dec.Stage = stage
	r.dec.Reason = reason
	r.status = status
	if r.shape == ShapeAnthropic {
		r.body = o.cfg.Encoding.ErrorBody(ShapeAnthropic, reason, string(action))
	} else {
		r.body = o.cfg.Encoding.ErrorBody(ShapeChat, reason, string(action))
	}
	r.headers["Content-Type"] = "application/json"
	return Result{Status: status, Body: r.body, Headers: r.headers}
}

// stageValidate checks schema, rate limit, and injection.
func (o *Orchestrator) stageValidate(r *run) (Result, bool) {
	if err := security.Schema(securityRequest(r.req), o.cfg.MaxTokens, int(o.cfg.MaxBodyBytes)); err != nil {
		return o.fail(r, http.StatusBadRequest, ActionBlock, StageValidate, err.Error()), true
	}
	if o.limiter != nil && !o.limiter.Allow(r.req.Key, r.req.ClientIP) {
		r.headers["Retry-After"] = "60"
		return o.fail(r, http.StatusTooManyRequests, ActionBlock, StageValidate, "rate limit exceeded for this key or client IP"), true
	}
	v := security.ScanRequest(o.detector, r.req.Text(), o.cfg.Thresholds, o.cfg.Monitor)
	r.dec.RuleHits = append(r.dec.RuleHits, toRuleHitsSecurity(v.Hits)...)
	if v.Block {
		return o.fail(r, http.StatusForbidden, ActionBlock, StageValidate,
			fmt.Sprintf("%s detector scored %.2f, at or above the block threshold", v.Family, v.Score)), true
	}
	return Result{}, false
}

// stageRedact replaces sensitive values in every message.
func (o *Orchestrator) stageRedact(r *run) (Result, bool) {
	if !o.cfg.Redact || len(o.cfg.Detectors) == 0 {
		r.dec.EstimatedTokens = estimate(r.req)
		return Result{}, false
	}
	red := &dlp.Redactor{Detectors: o.cfg.Detectors, Vault: o.cfg.Vault}
	if r.dec.Redactions == nil {
		r.dec.Redactions = map[string]string{}
	}
	changed := false
	for i := range r.req.Messages {
		out, redactions, hits := red.Redact(r.req.Messages[i].Content)
		if out != r.req.Messages[i].Content {
			changed = true
			r.req.Messages[i].Content = out
		}
		for tok, v := range redactions {
			r.dec.Redactions[tok] = v
		}
		r.dec.RuleHits = append(r.dec.RuleHits, toRuleHits(hits)...)
	}
	if changed {
		if r.dec.Action == ActionPass {
			r.dec.Action = ActionRedact
		}
		r.dec.Stage = StageRedact
	}
	r.dec.EstimatedTokens = estimate(r.req)
	return Result{}, false
}

// stageCache looks up the normalized prompt.
func (o *Orchestrator) stageCache(r *run) (Result, bool) {
	if o.cache == nil || !o.cfg.CacheEnabled || r.req.Stream || r.req.CacheBypass || r.req.Temperature > 0.2 {
		return Result{}, false
	}
	key := cache.Key(r.req.Text(), r.req.Model, r.req.Temperature)
	r.cacheKey = key
	body, status, ok := o.cache.Get(key)
	if !ok {
		return Result{}, false
	}
	// Cached bodies hold vault tokens, not raw values, so a hit restores the
	// ones this request knows and leaves the rest as tokens.
	if restored, in, out, err := o.processResponseBody(r, body); err == nil {
		body, r.inputTok, r.outputTok = restored, in, out
	} else {
		r.inputTok, r.outputTok = usageFromBody(r.shape, body)
	}
	r.dec.Action = ActionCacheHit
	r.dec.Stage = StageCache
	r.dec.EstimatedTokens = r.inputTok + r.outputTok
	if r.dec.EstimatedTokens == 0 {
		r.dec.EstimatedTokens = estimate(r.req)
	}
	inPrice, outPrice := o.price(r.req.Model)
	r.cost = float64(r.inputTok)/1e6*inPrice + float64(r.outputTok)/1e6*outPrice
	r.status = status
	r.headers["X-Guardrail-Cache"] = "HIT"
	r.headers["Content-Type"] = "application/json"
	return Result{
		Status:      status,
		Body:        body,
		Headers:     r.headers,
		CachedFrom:  "sqlite",
		SavedTokens: r.dec.EstimatedTokens,
		SavedUSD:    r.cost,
	}, true
}

// stageBudget enforces limits and injects the soft nudge.
func (o *Orchestrator) stageBudget(r *run) (Result, bool) {
	if o.ledger == nil {
		return Result{}, false
	}
	exceeded, reason, nudge := o.ledger.Check(r.req.Key, r.dec.EstimatedTokens, time.Now())
	if exceeded {
		r.headers["X-Guardrail-Budget"] = "exceeded"
		return o.fail(r, http.StatusTooManyRequests, ActionBlock, StageBudget, reason), true
	}
	r.dec.Stage = StageBudget
	if nudge {
		r.headers["X-Guardrail-Budget"] = "approaching"
		r.req.Nudge = true
		if r.dec.Action == ActionPass {
			r.dec.Action = ActionRedact
		}
	}
	return Result{}, false
}

// stageUpstream sends the request and runs the response stages.
func (o *Orchestrator) stageUpstream(ctx context.Context, r *run, sink ResponseSink) Result {
	adapter, ok := o.cfg.RouteFor(r.req.Route)
	if !ok {
		return o.fail(r, http.StatusBadGateway, ActionBlock, StageRoute, fmt.Sprintf("route %q is not configured", r.req.Route))
	}
	u, err := adapter.Prepare(r.req)
	if err != nil {
		return o.fail(r, http.StatusBadRequest, ActionBlock, StageRoute, err.Error())
	}
	resp, err := adapter.Do(ctx, u)
	if err != nil {
		return o.fail(r, http.StatusBadGateway, ActionBlock, StageRoute, err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		r.dec.Stage = StageRoute
		r.status = resp.StatusCode
		ct := resp.Header.Get("Content-Type")
		if ct == "" {
			ct = "application/json"
		}
		r.headers["Content-Type"] = ct
		return Result{Status: resp.StatusCode, Body: body, Headers: r.headers}
	}

	if u.Stream && strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		return o.streamThrough(r, resp, sink)
	}
	return o.buffered(r, resp)
}

// buffered reads the whole response, scans it, rewrites it, then stores it.
func (o *Orchestrator) buffered(r *run, resp *http.Response) Result {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return o.fail(r, http.StatusBadGateway, ActionBlock, StageRoute, "reading upstream response: "+err.Error())
	}
	r.status = resp.StatusCode
	r.headers["Content-Type"] = "application/json"

	if r.shape == ShapeEmbedding {
		r.inputTok, r.outputTok = usageFromBody(r.shape, raw)
		r.dec.Stage = StageResponseScan
		o.stageLedgerWrite(r)
		return Result{Status: r.status, Body: raw, Headers: r.headers}
	}

	text := o.cfg.Encoding.ResponseText(r.shape, raw)
	if res, blocked := o.scanOutput(r, text); blocked {
		return res
	}
	// Cache the tokenized body, then restore into the client copy. The cache
	// therefore never holds the raw values it is asked to protect.
	stored, client, in, out, err := o.tokenizeAndRewrite(r, raw)
	r.inputTok, r.outputTok = in, out
	if err != nil {
		stored, client = raw, raw
	}
	o.stageCacheWrite(r, stored)
	o.stageLedgerWrite(r)
	r.dec.Stage = StageRoute
	return Result{Status: r.status, Body: client, Headers: r.headers}
}

// tokenizeAndRewrite returns the cache copy (tokens in place) and the client
// copy (vault values restored).
func (o *Orchestrator) tokenizeAndRewrite(r *run, raw []byte) (stored, client []byte, in, out int, err error) {
	text := o.cfg.Encoding.ResponseText(r.shape, raw)
	tokenized := text
	if o.cfg.ResponseRedactPII && len(o.cfg.Detectors) > 0 && text != "" {
		red := &dlp.Redactor{Detectors: o.cfg.Detectors, Vault: o.cfg.Vault}
		tokenized, _, hits := red.Redact(text)
		if tokenized != text {
			for _, h := range hits {
				r.dec.RuleHits = append(r.dec.RuleHits, RuleHit{Rule: "output_" + h.Rule, Score: h.Score, Sample: h.Sample})
			}
			if r.dec.Action == ActionPass {
				r.dec.Action = ActionRedact
			}
		}
	}

	rewrite := func(s string) string { return s }
	if len(r.dec.Redactions) > 0 {
		rewrite = func(s string) string {
			out, _ := dlp.Rewrite(s, r.dec.Redactions)
			return out
		}
	}
	stored, in, out, err = o.cfg.Encoding.EncodeResponse(r.shape, raw, tokenized, rewrite)
	return stored, stored, in, out, err
}

// processResponseBody runs the stored body through rewrite for a cache hit.
func (o *Orchestrator) processResponseBody(r *run, body []byte) ([]byte, int, int, error) {
	text := o.cfg.Encoding.ResponseText(r.shape, body)
	if len(r.dec.Redactions) == 0 {
		in, out := usageFromBody(r.shape, body)
		return body, in, out, nil
	}
	restore := func(s string) string {
		out, _ := dlp.Rewrite(s, r.dec.Redactions)
		return out
	}
	return o.cfg.Encoding.EncodeResponse(r.shape, body, text, restore)
}

func (o *Orchestrator) stageCacheWrite(r *run, body []byte) {
	if o.cache == nil || !o.cfg.CacheEnabled || r.cacheKey == "" || r.status != http.StatusOK {
		return
	}
	_ = o.cache.Put(r.cacheKey, r.status, body)
}

func (o *Orchestrator) stageLedgerWrite(r *run) {
	if o.ledger == nil {
		return
	}
	r.cost = o.ledger.Record(r.req.Key, r.req.Model, r.inputTok, r.outputTok)
}

// streamThrough re-streams SSE chunks unchanged while accumulating the text.
// Re-identification needs the whole text and the client has already seen the
// chunks, so only the buffered copy is scanned. That is the trade-off
// DESIGN.md documents, not an accident.
func (o *Orchestrator) streamThrough(r *run, resp *http.Response, sink ResponseSink) Result {
	if sink == nil {
		return o.fail(r, http.StatusInternalServerError, ActionBlock, StageRoute, "streaming requested but the server cannot stream")
	}
	for k, v := range r.headers {
		sink.Header()[k] = v
	}
	sink.Header()["Content-Type"] = "text/event-stream"
	sink.Header()["Cache-Control"] = "no-cache"
	sink.WriteHeader(resp.StatusCode)

	var acc strings.Builder
	buf := make([]byte, 32<<10)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			acc.Write(buf[:n])
			if _, werr := sink.Write(buf[:n]); werr != nil {
				break
			}
			sink.Flush()
		}
		if err != nil {
			break
		}
	}
	full := acc.String()
	r.inputTok, r.outputTok = usageFromSSE(r.shape, full)
	if text := sseText(full); text != "" {
		o.scanOutput(r, text)
	}
	r.status = resp.StatusCode
	r.dec.Stage = StageResponseScan
	return Result{Status: resp.StatusCode, Body: nil, Headers: r.headers}
}

// scanOutput applies the response-side detectors. Blocking returns a 403 for
// credentials (default on) and for injection only when configured on. PII is
// tokenized later, not blocked.
func (o *Orchestrator) scanOutput(r *run, text string) (Result, bool) {
	if text == "" || len(o.cfg.Detectors) == 0 {
		return Result{}, false
	}
	if o.cfg.ResponseBlockInjection {
		v := security.ScanRequest(o.detector, text, o.cfg.Thresholds, false)
		if v.Block {
			r.dec.RuleHits = append(r.dec.RuleHits, RuleHit{Rule: "output_injection", Score: v.Score})
			return o.fail(r, http.StatusForbidden, ActionBlock, StageResponseScan, "model output tripped the injection detector"), true
		}
	}
	if o.cfg.ResponseBlockSecrets {
		for _, m := range dlp.Scan(o.cfg.Detectors, text) {
			switch m.Rule {
			case "private_key", "aws_key", "jwt", "generic_secret", "bearer_token", "connection_string":
				r.dec.RuleHits = append(r.dec.RuleHits, RuleHit{Rule: "output_" + m.Rule, Score: m.Score, Sample: maskSample(m.Value)})
				return o.fail(r, http.StatusForbidden, ActionBlock, StageResponseScan, "model output contained a credential pattern"), true
			}
		}
	}
	return Result{}, false
}

func (o *Orchestrator) price(model string) (in, out float64) {
	if o.ledger == nil {
		return 0, 0
	}
	return o.ledger.Price(model)
}

// estimate is chars/4 over the prompt plus the requested completion.
func estimate(req *Request) int {
	total := (len([]rune(req.Text())) + 3) / 4
	if req.MaxTokens > 0 {
		total += req.MaxTokens
	}
	return total
}

func maskSample(s string) string {
	if len(s) <= 4 {
		return "****"
	}
	return s[:2] + "****"
}

// usageFromBody extracts provider-reported usage from either wire envelope.
func usageFromBody(shape Shape, body []byte) (int, int) {
	if shape == ShapeAnthropic {
		var a struct {
			Usage struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
			} `json:"usage"`
		}
		if json.Unmarshal(body, &a) == nil {
			return a.Usage.InputTokens, a.Usage.OutputTokens
		}
		return 0, 0
	}
	var doc struct {
		Usage *struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
			InputTokens      int `json:"input_tokens"`
			OutputTokens     int `json:"output_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(body, &doc) != nil || doc.Usage == nil {
		return 0, 0
	}
	in, out := doc.Usage.PromptTokens, doc.Usage.CompletionTokens
	if in == 0 {
		in = doc.Usage.InputTokens
	}
	if out == 0 {
		out = doc.Usage.OutputTokens
	}
	return in, out
}

// sseText extracts assistant text from an accumulated SSE transcript.
func sseText(sse string) string {
	var b strings.Builder
	delta := &sseDelta{acc: &b}
	for _, line := range strings.Split(sse, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		delta.feed(payload)
	}
	return b.String()
}

type sseDelta struct{ acc *strings.Builder }

func (d *sseDelta) feed(payload string) {
	var chunk struct {
		Choices []struct {
			Delta struct {
				Content string `json:"content"`
				Text    string `json:"text"`
			} `json:"delta"`
			Text string `json:"text"`
		} `json:"choices"`
		Delta struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"delta"`
	}
	if json.Unmarshal([]byte(payload), &chunk) != nil {
		return
	}
	for _, c := range chunk.Choices {
		d.acc.WriteString(c.Delta.Content)
		d.acc.WriteString(c.Delta.Text)
		d.acc.WriteString(c.Text)
	}
	if chunk.Delta.Type == "text_delta" {
		d.acc.WriteString(chunk.Delta.Text)
	}
}

// usageFromSSE reads usage from the final chunks of a stream.
func usageFromSSE(shape Shape, sse string) (int, int) {
	in, out := 0, 0
	for _, line := range strings.Split(sse, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk struct {
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				InputTokens      int `json:"input_tokens"`
				OutputTokens     int `json:"output_tokens"`
			} `json:"usage"`
			Message *struct {
				Usage struct {
					InputTokens  int `json:"input_tokens"`
					OutputTokens int `json:"output_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		if chunk.Usage != nil {
			in = maxInt(in, chunk.Usage.PromptTokens, chunk.Usage.InputTokens)
			out = maxInt(out, chunk.Usage.CompletionTokens, chunk.Usage.OutputTokens)
		}
		if chunk.Message != nil {
			in = maxInt(in, chunk.Message.Usage.InputTokens)
			out = maxInt(out, chunk.Message.Usage.OutputTokens)
		}
	}
	return in, out
}

func maxInt(v int, vs ...int) int {
	for _, x := range vs {
		if x > v {
			v = x
		}
	}
	return v
}

// securityRequest narrows the internal request to the schema checker's view.
func securityRequest(req *Request) security.Request {
	msgs := make([]security.Message, 0, len(req.Messages))
	for _, m := range req.Messages {
		msgs = append(msgs, security.Message{Role: m.Role, Content: m.Content})
	}
	return security.Request{
		Model:       req.Model,
		Messages:    msgs,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		BodyBytes:   len(req.RawBody),
	}
}

func toRuleHits(hits []dlp.Hit) []RuleHit {
	out := make([]RuleHit, 0, len(hits))
	for _, h := range hits {
		out = append(out, RuleHit{Rule: h.Rule, Score: h.Score, Sample: h.Sample})
	}
	return out
}

func toRuleHitsSecurity(hits []security.Hit) []RuleHit {
	out := make([]RuleHit, 0, len(hits))
	for _, h := range hits {
		out = append(out, RuleHit{Rule: h.Rule, Score: h.Score, Sample: h.Sample})
	}
	return out
}

func auditHits(hits []RuleHit) []audit.Hit {
	out := make([]audit.Hit, 0, len(hits))
	for _, h := range hits {
		out = append(out, audit.Hit{Rule: h.Rule, Score: h.Score, Sample: h.Sample})
	}
	return out
}
