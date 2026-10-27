package server

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"sort"
	"strings"
	"unicode/utf8"

	"guardrail/internal/pipeline"
	"guardrail/internal/wire"
)

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) pipeline.Result {
	return s.completions(w, r, pipeline.ShapeChat)
}

func (s *Server) handleCompletions(w http.ResponseWriter, r *http.Request) pipeline.Result {
	return s.completions(w, r, pipeline.ShapeCompletion)
}

func (s *Server) handleEmbeddings(w http.ResponseWriter, r *http.Request) pipeline.Result {
	return s.completions(w, r, pipeline.ShapeEmbedding)
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) pipeline.Result {
	return s.completions(w, r, pipeline.ShapeAnthropic)
}

// completions is the one request path all four POST endpoints share: parse,
// resolve the route, run the pipeline.
func (s *Server) completions(w http.ResponseWriter, r *http.Request, shape pipeline.Shape) pipeline.Result {
	raw, err := readBody(r)
	if err != nil {
		return bodyError(shape, http.StatusRequestEntityTooLarge, err.Error())
	}
	req, err := parseRequest(raw, shape)
	if err != nil {
		return bodyError(shape, http.StatusBadRequest, err.Error())
	}
	req.ID = pipeline.NewID()
	req.Key = clientKey(r)
	req.ClientIP = clientIP(r)
	req.CacheBypass = strings.Contains(strings.ToLower(r.Header.Get("Cache-Control")), "no-cache")
	req.Route, req.Model = s.resolveRoute(r, req.Model)

	if _, ok := s.cfg.Routes[req.Route]; req.Stream && ok && !s.sameWire(shape, req.Route) {
		// The SSE chunks are forwarded byte-for-byte, so the upstream and the
		// client have to speak the same wire.
		return bodyError(shape, http.StatusBadRequest,
			"streaming across wire formats is not supported by this route; send stream=false")
	}

	var sink pipeline.ResponseSink
	if req.Stream {
		sink = &streamSink{w: w}
	}
	return s.orch.Execute(r.Context(), req, sink)
}

// handleCountTokens answers Claude Code's /v1/messages/count_tokens locally.
// Forwarding it would send the unredacted conversation upstream, and
// OpenAI-wire upstreams have no such endpoint. The estimate is chars/4 over
// the whole body, so tool definitions count and it errs high, which is the
// safe side for context-window decisions.
func (s *Server) handleCountTokens(w http.ResponseWriter, r *http.Request) pipeline.Result {
	raw, err := readBody(r)
	if err != nil {
		return bodyError(pipeline.ShapeAnthropic, http.StatusRequestEntityTooLarge, err.Error())
	}
	if _, err := wire.ParseAnthropic(raw); err != nil {
		return bodyError(pipeline.ShapeAnthropic, http.StatusBadRequest, err.Error())
	}
	body, _ := json.Marshal(map[string]int{"input_tokens": (utf8.RuneCount(raw) + 3) / 4})
	return pipeline.Result{
		Status:  http.StatusOK,
		Body:    body,
		Headers: map[string]string{"Content-Type": "application/json"},
	}
}

func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) pipeline.Result {
	seen := map[string]bool{}
	var models []string
	for _, rc := range s.cfg.Routes {
		for m := range rc.ModelMap {
			if !seen[m] {
				seen[m] = true
				models = append(models, m)
			}
		}
	}
	sort.Strings(models)
	return pipeline.Result{
		Status:  http.StatusOK,
		Body:    wire.ModelsBody(models),
		Headers: map[string]string{"Content-Type": "application/json"},
	}
}

// resolveRoute picks the route from, in order: the X-Guardrail-Route header,
// a "route/model" model prefix, a model_map that contains the model, and the
// default route. It returns the route name and the model with any prefix
// stripped.
func (s *Server) resolveRoute(r *http.Request, model string) (string, string) {
	if name := r.Header.Get("X-Guardrail-Route"); name != "" {
		if _, ok := s.cfg.Routes[name]; ok {
			return name, model
		}
	}
	if i := strings.Index(model, "/"); i > 0 {
		if _, ok := s.cfg.Routes[model[:i]]; ok {
			return model[:i], model[i+1:]
		}
	}
	names := make([]string, 0, len(s.cfg.Routes))
	for name := range s.cfg.Routes {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if _, ok := s.cfg.Routes[name].ModelMap[model]; ok {
			return name, model
		}
	}
	for _, name := range []string{"openai", "claude"} {
		if _, ok := s.cfg.Routes[name]; ok {
			return name, model
		}
	}
	if len(names) > 0 {
		return names[0], model
	}
	return "", model
}

func (s *Server) sameWire(shape pipeline.Shape, routeName string) bool {
	rc, ok := s.cfg.Routes[routeName]
	if !ok {
		return false
	}
	if shape == pipeline.ShapeAnthropic {
		return rc.Wire == "anthropic"
	}
	return rc.Wire == "openai"
}

func parseRequest(raw []byte, shape pipeline.Shape) (*pipeline.Request, error) {
	if shape == pipeline.ShapeAnthropic {
		return wire.ParseAnthropic(raw)
	}
	return wire.ParseOpenAI(raw, shape)
}

func readBody(r *http.Request) ([]byte, error) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return nil, errors.New("request body exceeds max_body_bytes")
		}
		return nil, err
	}
	return body, nil
}

func clientKey(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return after
		}
		return h
	}
	if k := r.Header.Get("X-Api-Key"); k != "" {
		return k
	}
	return "anonymous"
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func bodyError(shape pipeline.Shape, status int, msg string) pipeline.Result {
	typ := "invalid_request_error"
	if status == http.StatusTooManyRequests {
		typ = "rate_limit_error"
	}
	return pipeline.Result{
		Status: status,
		Body:   wire.Encoder{}.ErrorBody(shape, msg, typ),
		Headers: map[string]string{
			"Content-Type":       "application/json",
			"X-Guardrail-Action": "block",
			"X-Guardrail-Stage":  "validate",
		},
	}
}

// streamSink adapts the HTTP writer to pipeline.ResponseSink. The pipeline
// fills Header() before calling WriteHeader, so the map is applied there.
type streamSink struct {
	w       http.ResponseWriter
	headers map[string]string
}

func (s *streamSink) Header() map[string]string {
	if s.headers == nil {
		s.headers = map[string]string{}
	}
	return s.headers
}

func (s *streamSink) WriteHeader(status int) {
	for k, v := range s.headers {
		s.w.Header().Set(k, v)
	}
	s.w.WriteHeader(status)
}

func (s *streamSink) Write(p []byte) (int, error) { return s.w.Write(p) }

func (s *streamSink) Flush() {
	if f, ok := s.w.(http.Flusher); ok {
		f.Flush()
	}
}
