// Package wire parses client requests into the internal shape and encodes
// upstream responses back into the client's wire format.
package wire

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"guardrail/internal/pipeline"
)

// ContentPart is one element of a multipart OpenAI message.
type ContentPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// OpenAIMessage is one turn as OpenAI encodes it. Content is kept raw so both
// the string form and the multipart array form parse.
type OpenAIMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

// OpenAIRequest is the union of the fields the pipeline reads from every
// OpenAI-compatible endpoint.
type OpenAIRequest struct {
	Model       string          `json:"model"`
	Messages    []OpenAIMessage `json:"messages"`
	Prompt      json.RawMessage `json:"prompt"`
	Input       json.RawMessage `json:"input"`
	MaxTokens   int             `json:"max_tokens"`
	Temperature *float64        `json:"temperature"`
	Stream      bool            `json:"stream"`
	Stop        []string        `json:"stop"`
}

// OpenAIResponse is the response envelope the proxy reads usage from and
// re-encodes after rewrite.
type OpenAIResponse struct {
	ID      string         `json:"id"`
	Object  string         `json:"object"`
	Created int64          `json:"created"`
	Model   string         `json:"model"`
	Choices []OpenAIChoice `json:"choices"`
	Usage   *OpenAIUsage   `json:"usage,omitempty"`
}

type OpenAIChoice struct {
	Index        int           `json:"index"`
	Message      OpenAIMessage `json:"message,omitempty"`
	Text         string        `json:"text,omitempty"`
	FinishReason string        `json:"finish_reason"`
}

type OpenAIUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Parse shape detection. The endpoint path tells us which body proves the
// shape, which matters because `/v1/chat/completions` and `/v1/completions`
// share a JSON namespace.

// ClosestEndpoint maps a path to the shape the proxy treats it as.
func ClosestEndpoint(path string) pipeline.Shape {
	switch {
	case strings.HasSuffix(path, "/embeddings"):
		return pipeline.ShapeEmbedding
	case strings.HasSuffix(path, "/chat/completions"):
		return pipeline.ShapeChat
	case strings.HasSuffix(path, "/completions"):
		return pipeline.ShapeCompletion
	case strings.HasSuffix(path, "/messages"):
		return pipeline.ShapeAnthropic
	}
	return pipeline.ShapeChat
}

// ParseOpenAI normalizes an OpenAI request body. shape must come from the path
// so a completions body is not rejected for lacking messages.
func ParseOpenAI(raw []byte, shape pipeline.Shape) (*pipeline.Request, error) {
	var body OpenAIRequest
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	if err := dec.Decode(&body); err != nil {
		return nil, fmt.Errorf("body is not valid JSON: %w", err)
	}
	req := &pipeline.Request{
		Model:     body.Model,
		MaxTokens: body.MaxTokens,
		Stream:    body.Stream,
		Stop:      body.Stop,
		RawBody:   raw,
		Shape:     shape,
	}
	if body.Temperature != nil {
		req.Temperature = *body.Temperature
	} else {
		req.Temperature = 1.0
	}
	if req.MaxTokens == 0 {
		req.MaxTokens = 1024
	}
	switch shape {
	case pipeline.ShapeEmbedding:
		text, err := flattenPrompt(body.Input)
		if err != nil {
			return nil, fmt.Errorf("input: %w", err)
		}
		req.Messages = []pipeline.Message{{Role: "user", Content: text}}
		req.MaxTokens = 0
	case pipeline.ShapeCompletion:
		text, err := flattenPrompt(body.Prompt)
		if err != nil {
			return nil, fmt.Errorf("prompt: %w", err)
		}
		req.Messages = []pipeline.Message{{Role: "user", Content: text}}
	case pipeline.ShapeChat:
		if len(body.Messages) == 0 {
			return nil, errors.New("messages is empty")
		}
		for i, m := range body.Messages {
			text, err := flattenContent(m.Content)
			if err != nil {
				return nil, fmt.Errorf("messages[%d].content: %w", i, err)
			}
			req.Messages = append(req.Messages, pipeline.Message{Role: defaultsRole(m.Role), Content: text})
		}
	default:
		return nil, fmt.Errorf("unsupported shape %q", shape)
	}
	return req, nil
}

// BuildOpenAIRequest rebuilds an Anthropic-shaped internal request as an
// OpenAI chat body. It is the mirror of BuildAnthropicRequest and only runs
// when the client and the route speak different wires.
func BuildOpenAIRequest(req *pipeline.Request, model string, maxTokens int) ([]byte, error) {
	msgs := make([]OpenAIMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		encoded, _ := json.Marshal(m.Content)
		msgs = append(msgs, OpenAIMessage{Role: m.Role, Content: encoded})
	}
	body := map[string]any{
		"model":       model,
		"messages":    msgs,
		"max_tokens":  maxTokens,
		"temperature": req.Temperature,
	}
	if req.Stream {
		body["stream"] = true
	}
	if len(req.Stop) > 0 {
		body["stop"] = req.Stop
	}
	return json.Marshal(body)
}

func defaultsRole(r string) string {
	if r == "" {
		return "user"
	}
	return r
}

// flattenContent handles both `"content": "text"` and `"content": [{...}]`.
func flattenContent(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}
	var parts []ContentPart
	if err := json.Unmarshal(raw, &parts); err != nil {
		return "", errors.New("content must be a string or an array of parts")
	}
	var b strings.Builder
	for _, p := range parts {
		b.WriteString(p.Text)
	}
	return b.String(), nil
}

func flattenPrompt(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", errors.New("prompt or input is required")
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s, nil
	}
	var list []string
	if err := json.Unmarshal(raw, &list); err == nil {
		return strings.Join(list, "\n"), nil
	}
	return "", errors.New("prompt must be a string or an array of strings")
}

// EncodeOpenAIResult re-encodes a parsed response after its text changed.
func EncodeOpenAIResult(shape pipeline.Shape, raw []byte, newText func(string) string) ([]byte, int, int, error) {
	switch shape {
	case pipeline.ShapeEmbedding:
		return raw, 0, 0, nil
	}
	var resp OpenAIResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return raw, 0, 0, fmt.Errorf("upstream response is not OpenAI JSON: %w", err)
	}
	for i := range resp.Choices {
		c := &resp.Choices[i]
		if c.Text != "" || shape == pipeline.ShapeCompletion {
			c.Text = newText(c.Text)
			continue
		}
		if len(c.Message.Content) > 0 {
			var s string
			if json.Unmarshal(c.Message.Content, &s) == nil {
				encoded, _ := json.Marshal(newText(s))
				c.Message.Content = encoded
			}
		}
	}
	input, output := 0, 0
	if resp.Usage != nil {
		input, output = resp.Usage.PromptTokens, resp.Usage.CompletionTokens
	}
	out, err := json.Marshal(resp)
	return out, input, output, err
}

// ResponseText returns the concatenated assistant text of an OpenAI response,
// which is what the output scanners read.
func ResponseText(shape pipeline.Shape, raw []byte) string {
	if shape == pipeline.ShapeEmbedding {
		return ""
	}
	var resp OpenAIResponse
	if json.Unmarshal(raw, &resp) != nil {
		return ""
	}
	var b strings.Builder
	for _, c := range resp.Choices {
		if c.Text != "" {
			b.WriteString(c.Text)
		}
		if len(c.Message.Content) > 0 {
			var s string
			if json.Unmarshal(c.Message.Content, &s) == nil {
				b.WriteString(s)
			}
		}
	}
	return b.String()
}

// ErrorBody renders an OpenAI-shaped error.
func ErrorBody(message, typ string) []byte {
	b, _ := json.Marshal(map[string]any{
		"error": map[string]string{"message": message, "type": typ},
	})
	return b
}

// ModelsBody renders the model catalog.
func ModelsBody(models []string) []byte {
	type model struct {
		ID      string `json:"id"`
		Object  string `json:"object"`
		OwnedBy string `json:"owned_by"`
	}
	list := make([]model, 0, len(models))
	for _, m := range models {
		list = append(list, model{ID: m, Object: "model", OwnedBy: "guardrail"})
	}
	b, _ := json.Marshal(map[string]any{"object": "list", "data": list})
	return b
}

// EncodeResponse re-encodes a non-streaming response after its text changed.
// stored is the text the cache keeps (tokens in place); rewrite maps it to the
// text the client sees.
func EncodeResponse(shape pipeline.Shape, raw []byte, stored string, rewrite func(string) string) ([]byte, int, int, error) {
	if shape == pipeline.ShapeEmbedding {
		return raw, 0, 0, nil
	}
	if rewrite == nil {
		rewrite = func(s string) string { return s }
	}
	if shape == pipeline.ShapeAnthropic {
		return EncodeAnthropicResponse(raw, rewrite)
	}
	return EncodeOpenAIResult(shape, raw, rewrite)
}

// Encoder is the pipeline.Encoder implementation over both wire formats.
type Encoder struct{}

// ErrorBody renders an error in the shape the client speaks.
func (Encoder) ErrorBody(shape pipeline.Shape, message, typ string) []byte {
	if shape == pipeline.ShapeAnthropic {
		return AnthropicErrorBody(message, typ)
	}
	return ErrorBody(message, typ)
}

// Decode reduces a response body into the text, usage, and client-shape
// encoder the pipeline works with.
func (Encoder) Decode(upstream, client pipeline.Shape, raw []byte) (pipeline.Decoded, error) {
	return Decode(upstream, client, raw)
}
