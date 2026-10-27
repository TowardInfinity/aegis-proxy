// Package pipeline holds the normalized request/decision/result shapes shared
// by every stage, and the orchestrator that runs the stages in order.
package pipeline

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

// Shape is the wire protocol the client speaks. It decides how the response
// body is encoded on the way back.
type Shape string

const (
	ShapeChat       Shape = "chat"
	ShapeCompletion Shape = "completion"
	ShapeEmbedding  Shape = "embedding"
	ShapeAnthropic  Shape = "anthropic"
)

// Message is one conversational turn. Content is flattened to text at the
// boundary; multimodal parts and tool calls do not survive normalization.
//
// Parts, when non-nil, holds every text-bearing leaf of a block-structured
// message (text blocks, tool results, tool inputs) in wire order. Stages edit
// Parts and the wire layer writes each leaf back in place, so block structure
// survives redaction. Content is then the leaves joined by newlines.
type Message struct {
	Role    string
	Content string
	Parts   []string
}

// SetParts replaces the leaves and keeps Content in sync.
func (m *Message) SetParts(parts []string) {
	m.Parts = parts
	m.Content = strings.Join(parts, "\n")
}

// Request is the normalized internal request. Every field is already parsed
// and validated by the wire layer, so stages trust it.
type Request struct {
	ID          string
	Key         string
	ClientIP    string
	Route       string
	Model       string
	Messages    []Message
	MaxTokens   int
	Temperature float64
	// TemperatureSet distinguishes an explicit caller temperature from the
	// wire-layer default, so cache keys can ignore defaulted values.
	TemperatureSet bool
	Stream         bool
	Stop           []string
	RawBody        []byte
	CacheBypass    bool
	Shape          Shape
	// Nudge marks that the budget stage added its soft system message. The
	// wire layer prepends it when rebuilding a request it cannot patch.
	Nudge bool
}

// Action is the outcome of a request, as reported on X-Guardrail-Action.
type Action string

const (
	ActionPass     Action = "pass"
	ActionRedact   Action = "redact"
	ActionBlock    Action = "block"
	ActionCacheHit Action = "cache_hit"
)

// Stage names, in pipeline order. They are the vocabulary of the audit log and
// of X-Guardrail-Stage, so they match DESIGN.md exactly.
const (
	StageValidate     = "validate"
	StageRedact       = "redact"
	StageCache        = "cache"
	StageBudget       = "budget"
	StageRoute        = "route"
	StageResponseScan = "response-scan"
	StageRewrite      = "rewrite"
	StageCacheWrite   = "cache-write"
	StageLedgerWrite  = "ledger-write"
	StageAudit        = "audit"
)

// RuleHit is one detector firing, with its score and a short redacted sample.
type RuleHit struct {
	Rule   string  `json:"rule"`
	Score  float64 `json:"score"`
	Sample string  `json:"sample,omitempty"`
}

// Decision records what the pipeline decided and why.
type Decision struct {
	Action          Action
	Stage           string
	RuleHits        []RuleHit
	Redactions      map[string]string
	EstimatedTokens int
	Reason          string
}

// Result is what the HTTP layer writes back to the client.
type Result struct {
	Status      int
	Body        []byte
	Headers     map[string]string
	CachedFrom  string
	SavedTokens int
	SavedUSD    float64
}

// ResponseSink lets a streaming request write straight through to the client
// without pipeline depending on net/http.
type ResponseSink interface {
	Header() map[string]string
	WriteHeader(status int)
	Write(p []byte) (int, error)
	Flush()
}

// NewID returns a short random request id.
func NewID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Text concatenates every message body, which is what the text detectors scan.
func (r *Request) Text() string {
	out := ""
	for _, m := range r.Messages {
		if out != "" {
			out += "\n"
		}
		out += m.Role + ": " + m.Content
	}
	return out
}
