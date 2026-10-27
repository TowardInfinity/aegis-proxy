// Package route maps the internal request onto a provider's wire format and
// performs the upstream call, including retries for the failures worth
// retrying.
package route

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"guardrail/internal/pipeline"
	"guardrail/internal/wire"
)

// Route is a resolved route from config.
type Route struct {
	Name     string
	Wire     string
	BaseURL  string
	AuthEnv  string
	ModelMap map[string]string
	Timeout  time.Duration
	Retries  int
}

// Adapter maps one request onto one provider. It satisfies pipeline.Adapter.
type Adapter struct {
	Route  Route
	Client *http.Client
}

// NewAdapter builds an adapter with the route's timeout.
func NewAdapter(r Route) *Adapter {
	if r.Timeout <= 0 {
		r.Timeout = 60 * time.Second
	}
	if r.Retries <= 0 {
		r.Retries = 2
	}
	return &Adapter{
		Route: r,
		Client: &http.Client{
			Timeout: r.Timeout,
			Transport: &http.Transport{
				Proxy:                 http.ProxyFromEnvironment,
				MaxIdleConns:          100,
				IdleConnTimeout:       90 * time.Second,
				ResponseHeaderTimeout: r.Timeout,
			},
		},
	}
}

// AuthToken reads the route's API key from the environment. An empty auth_env
// means the upstream needs no auth, as with a local Ollama.
func (a *Adapter) AuthToken() string {
	if a.Route.AuthEnv == "" {
		return ""
	}
	return os.Getenv(a.Route.AuthEnv)
}

// Prepare builds the outbound request for a normalized request.
func (a *Adapter) Prepare(req *pipeline.Request) (*pipeline.Upstream, error) {
	model := wire.MapModel(a.Route.ModelMap, req.Model)
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 1024
	}
	var (
		u   *pipeline.Upstream
		err error
	)
	switch a.Route.Wire {
	case "anthropic":
		u, err = a.prepareAnthropic(req, model, maxTokens)
	case "openai":
		u, err = a.prepareOpenAI(req, model, maxTokens)
	default:
		return nil, fmt.Errorf("route %q has unknown wire %q", a.Route.Name, a.Route.Wire)
	}
	if err != nil {
		return nil, err
	}
	if tok := a.AuthToken(); tok != "" {
		if a.Route.Wire == "anthropic" {
			u.Headers["x-api-key"] = tok
			u.Headers["anthropic-version"] = "2023-06-01"
		} else {
			u.Headers["Authorization"] = "Bearer " + tok
		}
	}
	return u, nil
}

func (a *Adapter) prepareOpenAI(req *pipeline.Request, model string, maxTokens int) (*pipeline.Upstream, error) {
	path := a.path()
	switch req.Shape {
	case pipeline.ShapeChat:
		path = joinURL(path, "/chat/completions")
	case pipeline.ShapeCompletion:
		path = joinURL(path, "/completions")
	case pipeline.ShapeEmbedding:
		path = joinURL(path, "/embeddings")
	default:
		path = joinURL(path, "/chat/completions")
	}
	var body []byte
	var err error
	if req.Shape == pipeline.ShapeAnthropic {
		body, err = wire.BuildOpenAIRequest(req, model, maxTokens)
	} else {
		body, err = wire.Patch(req.Shape, req.RawBody, req, model, maxTokens)
	}
	if err != nil {
		return nil, err
	}
	return &pipeline.Upstream{
		URL:     path,
		Headers: map[string]string{"Content-Type": "application/json", "Accept": accept(req.Stream)},
		Body:    body,
		Stream:  req.Stream,
		Wire:    a.Route.Wire,
	}, nil
}

func (a *Adapter) prepareAnthropic(req *pipeline.Request, model string, maxTokens int) (*pipeline.Upstream, error) {
	// Anthropic speaks one endpoint, so an OpenAI-shaped client request is
	// rebuilt from the internal shape and its response re-encoded on return.
	var body []byte
	var err error
	if req.Shape == pipeline.ShapeAnthropic {
		body, err = wire.Patch(req.Shape, req.RawBody, req, model, maxTokens)
	} else {
		body, err = wire.BuildAnthropicRequest(req, model, maxTokens)
	}
	if err != nil {
		return nil, err
	}
	return &pipeline.Upstream{
		URL:     joinURL(a.path(), "/v1/messages"),
		Headers: map[string]string{"Content-Type": "application/json", "Accept": accept(req.Stream)},
		Body:    body,
		Stream:  req.Stream,
		Wire:    a.Route.Wire,
	}, nil
}

func (a *Adapter) path() string {
	if a.Route.Wire == "openai" && !strings.HasSuffix(a.Route.BaseURL, "/v1") {
		return joinURL(a.Route.BaseURL, "/v1")
	}
	return a.Route.BaseURL
}

func joinURL(base, suffix string) string {
	return strings.TrimRight(base, "/") + suffix
}

func accept(stream bool) string {
	if stream {
		return "text/event-stream"
	}
	return "application/json"
}

// Do sends the request, retrying only on 5xx and timeout with jittered
// exponential backoff. A 4xx is the client's fault and is returned as-is.
func (a *Adapter) Do(ctx context.Context, u *pipeline.Upstream) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt <= a.Route.Retries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(1<<uint(attempt-1)) * 200 * time.Millisecond
			jitter := time.Duration(rand.Int63n(int64(backoff/2) + 1))
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff + jitter):
			}
		}
		resp, err := a.send(ctx, u)
		if err != nil {
			if !retriable(err) {
				return nil, err
			}
			lastErr = err
			continue
		}
		if resp.StatusCode >= 500 {
			io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
			resp.Body.Close()
			lastErr = fmt.Errorf("upstream returned %d", resp.StatusCode)
			continue
		}
		return resp, nil
	}
	return nil, fmt.Errorf("upstream failed after %d attempts: %w", a.Route.Retries+1, lastErr)
}

func (a *Adapter) send(ctx context.Context, u *pipeline.Upstream) (*http.Response, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, u.URL, bytes.NewReader(u.Body))
	if err != nil {
		return nil, err
	}
	for k, v := range u.Headers {
		httpReq.Header.Set(k, v)
	}
	return a.Client.Do(httpReq)
}

// retriable covers the two cases DESIGN.md allows: transport failure and
// timeout. A connection refusal is usually a dead upstream, which will not
// heal inside a 200 ms backoff, so only timeouts and resets retry.
func retriable(err error) bool {
	if err == context.DeadlineExceeded {
		return true
	}
	var urlErr *url.Error
	if ok := asURL(err, &urlErr); ok {
		if urlErr.Timeout() {
			return true
		}
	}
	msg := err.Error()
	return strings.Contains(msg, "connection reset") || strings.Contains(msg, "unexpected EOF")
}

func asURL(err error, target **url.Error) bool {
	for err != nil {
		if e, ok := err.(*url.Error); ok {
			*target = e
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
