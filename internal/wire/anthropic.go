package wire

import (
	"encoding/json"
	"fmt"
	"strings"

	"guardrail/internal/pipeline"
)

// AnthropicRequest is the Messages API body.
type AnthropicRequest struct {
	Model       string             `json:"model"`
	System      json.RawMessage    `json:"system,omitempty"`
	Messages    []AnthropicMessage `json:"messages"`
	MaxTokens   int                `json:"max_tokens"`
	Temperature *float64           `json:"temperature,omitempty"`
	Stream      bool               `json:"stream,omitempty"`
	StopSeq     []string           `json:"stop_sequences,omitempty"`
}

type AnthropicMessage struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type AnthropicResponse struct {
	ID      string           `json:"id"`
	Type    string           `json:"type"`
	Role    string           `json:"role"`
	Model   string           `json:"model"`
	Content []AnthropicBlock `json:"content"`
	Usage   *AnthropicUsage  `json:"usage,omitempty"`
	Stop    string           `json:"stop_reason,omitempty"`
}

type AnthropicBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type AnthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// ParseAnthropic normalizes a /v1/messages body.
func ParseAnthropic(raw []byte) (*pipeline.Request, error) {
	var body AnthropicRequest
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("body is not valid JSON: %w", err)
	}
	if len(body.Messages) == 0 {
		return nil, fmt.Errorf("messages is empty")
	}
	req := &pipeline.Request{
		Model:       body.Model,
		MaxTokens:   body.MaxTokens,
		Stream:      body.Stream,
		Stop:        body.StopSeq,
		RawBody:     raw,
		Shape:       pipeline.ShapeAnthropic,
		Temperature: 1.0,
	}
	if body.Temperature != nil {
		req.Temperature = *body.Temperature
		req.TemperatureSet = true
	}
	if sys := anthropicText(body.System); sys != "" {
		req.Messages = append(req.Messages, pipeline.Message{Role: "system", Content: sys})
	}
	for i, m := range body.Messages {
		req.Messages = append(req.Messages, pipeline.Message{Role: defaultsRole(m.Role), Content: anthropicText(m.Content)})
		_ = i
	}
	return req, nil
}

// anthropicText flattens system or content, which is either a string or an
// array of blocks.
func anthropicText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var blocks []AnthropicBlock
	if json.Unmarshal(raw, &blocks) == nil {
		var b strings.Builder
		for _, blk := range blocks {
			b.WriteString(blk.Text)
		}
		return b.String()
	}
	return ""
}

// BuildAnthropicRequest maps the internal request to a Messages body. System
// turns collapse into the top-level system field, which Anthropic requires.
func BuildAnthropicRequest(req *pipeline.Request, model string, maxTokens int) ([]byte, error) {
	var system []string
	var msgs []AnthropicMessage
	for _, m := range req.Messages {
		if m.Role == "system" {
			system = append(system, m.Content)
			continue
		}
		content, _ := json.Marshal([]AnthropicBlock{{Type: "text", Text: m.Content}})
		msgs = append(msgs, AnthropicMessage{Role: m.Role, Content: content})
	}
	if len(msgs) == 0 {
		return nil, fmt.Errorf("no user or assistant messages to send")
	}
	body := AnthropicRequest{
		Model:     model,
		Messages:  msgs,
		MaxTokens: maxTokens,
		Stream:    req.Stream,
		StopSeq:   req.Stop,
	}
	temp := req.Temperature
	body.Temperature = &temp
	if len(system) > 0 {
		sys, _ := json.Marshal(strings.Join(system, "\n\n"))
		body.System = sys
	}
	if body.MaxTokens <= 0 {
		body.MaxTokens = 1024
	}
	return json.Marshal(body)
}

// ParseAnthropicResponse extracts assistant text and usage.
func ParseAnthropicResponse(raw []byte) (string, int, int, error) {
	var resp AnthropicResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", 0, 0, fmt.Errorf("upstream response is not Anthropic JSON: %w", err)
	}
	var b strings.Builder
	for _, c := range resp.Content {
		b.WriteString(c.Text)
	}
	in, out := 0, 0
	if resp.Usage != nil {
		in, out = resp.Usage.InputTokens, resp.Usage.OutputTokens
	}
	return b.String(), in, out, nil
}

// EncodeAnthropicResponse rewrites text blocks in an Anthropic response.
func EncodeAnthropicResponse(raw []byte, newText func(string) string) ([]byte, int, int, error) {
	var resp AnthropicResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return raw, 0, 0, err
	}
	for i := range resp.Content {
		if resp.Content[i].Type == "text" {
			resp.Content[i].Text = newText(resp.Content[i].Text)
		}
	}
	in, out := 0, 0
	if resp.Usage != nil {
		in, out = resp.Usage.InputTokens, resp.Usage.OutputTokens
	}
	b, err := json.Marshal(resp)
	return b, in, out, err
}

// AnthropicErrorBody renders the Anthropic error envelope.
func AnthropicErrorBody(message, typ string) []byte {
	b, _ := json.Marshal(map[string]any{
		"type":  "error",
		"error": map[string]string{"type": typ, "message": message},
	})
	return b
}

// MapModel applies the route's model map, passing through unknown models so a
// new model does not require a config change.
func MapModel(mapping map[string]string, model string) string {
	if m, ok := mapping[model]; ok {
		return m
	}
	return model
}
