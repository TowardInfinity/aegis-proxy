package wire

import (
	"encoding/json"
	"testing"

	"guardrail/internal/pipeline"
)

const openAIResponse = `{
  "id":"chatcmpl-1","object":"chat.completion","created":1,"model":"gpt-4o",
  "choices":[{"index":0,"message":{"role":"assistant","content":"hello there"},"finish_reason":"stop"}],
  "usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}
}`

const anthropicResponse = `{
  "id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5",
  "content":[{"type":"text","text":"hello there"}],
  "usage":{"input_tokens":11,"output_tokens":3}
}`

func TestParseOpenAIChat(t *testing.T) {
	body := `{"model":"gpt-4o","messages":[
		{"role":"system","content":"be terse"},
		{"role":"user","content":[{"type":"text","text":"hi "},{"type":"text","text":"there"}]}
	],"max_tokens":64,"temperature":0.3}`
	req, err := ParseOpenAI([]byte(body), pipeline.ShapeChat)
	if err != nil {
		t.Fatal(err)
	}
	if req.Model != "gpt-4o" || req.MaxTokens != 64 || req.Temperature != 0.3 {
		t.Fatalf("unexpected request: %+v", req)
	}
	if len(req.Messages) != 2 || req.Messages[1].Content != "hi there" {
		t.Fatalf("messages = %+v", req.Messages)
	}
}

func TestParseOpenAIDefaults(t *testing.T) {
	req, err := ParseOpenAI([]byte(`{"model":"m","messages":[{"role":"user","content":"x"}]}`), pipeline.ShapeChat)
	if err != nil {
		t.Fatal(err)
	}
	if req.MaxTokens != 1024 {
		t.Fatalf("default max_tokens = %d", req.MaxTokens)
	}
	if req.Temperature != 1.0 {
		t.Fatalf("default temperature = %v", req.Temperature)
	}
}

func TestParseOpenAIRejectsBadShapes(t *testing.T) {
	if _, err := ParseOpenAI([]byte(`{"model":"m","messages":[]}`), pipeline.ShapeChat); err == nil {
		t.Fatal("empty messages accepted")
	}
	if _, err := ParseOpenAI([]byte(`not json`), pipeline.ShapeChat); err == nil {
		t.Fatal("invalid JSON accepted")
	}
	if _, err := ParseOpenAI([]byte(`{"model":"m"}`), pipeline.ShapeCompletion); err == nil {
		t.Fatal("completion without prompt accepted")
	}
}

func TestOpenAIToAnthropicMapping(t *testing.T) {
	openai := `{"model":"gpt-4o","messages":[
		{"role":"system","content":"be terse"},
		{"role":"user","content":"what is 2+2?"}
	],"max_tokens":64,"temperature":0.4}`
	req, err := ParseOpenAI([]byte(openai), pipeline.ShapeChat)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := BuildAnthropicRequest(req, "claude-sonnet-4-5", 64)
	if err != nil {
		t.Fatal(err)
	}
	var out struct {
		Model     string `json:"model"`
		System    string `json:"system"`
		MaxTokens int    `json:"max_tokens"`
		Messages  []struct {
			Role    string `json:"role"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.Model != "claude-sonnet-4-5" || out.MaxTokens != 64 {
		t.Fatalf("mapping lost model or max_tokens: %s", raw)
	}
	if out.System != "be terse" {
		t.Fatalf("system not extracted to the top level: %q", out.System)
	}
	if len(out.Messages) != 1 || out.Messages[0].Role != "user" {
		t.Fatalf("messages = %+v", out.Messages)
	}
	if len(out.Messages[0].Content) != 1 || out.Messages[0].Content[0].Type != "text" || out.Messages[0].Content[0].Text != "what is 2+2?" {
		t.Fatalf("content blocks = %+v", out.Messages[0].Content)
	}
}

func TestAnthropicToOpenAIMapping(t *testing.T) {
	body := `{"model":"claude-sonnet-4-5","system":"be terse","max_tokens":32,
		"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]}`
	req, err := ParseAnthropic([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(req.Messages) != 2 || req.Messages[0].Role != "system" || req.Messages[0].Content != "be terse" {
		t.Fatalf("system not normalized first: %+v", req.Messages)
	}
	raw, err := BuildOpenAIRequest(req, "gpt-4o", 32)
	if err != nil {
		t.Fatal(err)
	}
	var out struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	if out.Model != "gpt-4o" || len(out.Messages) != 2 || out.Messages[1].Content != "hello" {
		t.Fatalf("mapping = %s", raw)
	}
}

func TestDecodeSameWireKeepsBody(t *testing.T) {
	d, err := Decode(pipeline.ShapeChat, pipeline.ShapeChat, []byte(openAIResponse))
	if err != nil {
		t.Fatal(err)
	}
	if d.Text != "hello there" || d.InputTokens != 11 || d.OutputTokens != 3 {
		t.Fatalf("decoded = %+v", d)
	}
	if got := string(d.Encode("hello there")); got != openAIResponse {
		t.Fatal("unchanged text did not round trip byte for byte")
	}
	changed := string(d.Encode("bye"))
	var out OpenAIResponse
	if err := json.Unmarshal([]byte(changed), &out); err != nil {
		t.Fatal(err)
	}
	if out.Choices[0].Message.Content == nil {
		t.Fatal("rewritten body lost content")
	}
	var text string
	_ = json.Unmarshal(out.Choices[0].Message.Content, &text)
	if text != "bye" || out.Usage == nil || out.Usage.PromptTokens != 11 {
		t.Fatalf("rewrite lost text or usage: %s", changed)
	}
}

func TestDecodeOpenAIUpstreamForAnthropicClient(t *testing.T) {
	d, err := Decode(pipeline.ShapeChat, pipeline.ShapeAnthropic, []byte(openAIResponse))
	if err != nil {
		t.Fatal(err)
	}
	if d.Text != "hello there" {
		t.Fatalf("text = %q", d.Text)
	}
	var out AnthropicResponse
	if err := json.Unmarshal(d.Encode("rewritten"), &out); err != nil {
		t.Fatal(err)
	}
	if out.Type != "message" || out.Role != "assistant" {
		t.Fatalf("envelope = %+v", out)
	}
	if len(out.Content) != 1 || out.Content[0].Text != "rewritten" {
		t.Fatalf("content = %+v", out.Content)
	}
	if out.Usage == nil || out.Usage.InputTokens != 11 || out.Usage.OutputTokens != 3 {
		t.Fatalf("usage = %+v", out.Usage)
	}
}

func TestDecodeAnthropicUpstreamForOpenAIClient(t *testing.T) {
	d, err := Decode(pipeline.ShapeAnthropic, pipeline.ShapeChat, []byte(anthropicResponse))
	if err != nil {
		t.Fatal(err)
	}
	if d.Text != "hello there" || d.InputTokens != 11 || d.OutputTokens != 3 {
		t.Fatalf("decoded = %+v", d)
	}
	var out OpenAIResponse
	if err := json.Unmarshal(d.Encode("rewritten"), &out); err != nil {
		t.Fatal(err)
	}
	var text string
	_ = json.Unmarshal(out.Choices[0].Message.Content, &text)
	if text != "rewritten" || out.Usage == nil || out.Usage.CompletionTokens != 3 {
		t.Fatalf("envelope = %s", d.Encode("rewritten"))
	}
}

func TestEmbeddingsPassthrough(t *testing.T) {
	body := []byte(`{"object":"list","data":[{"embedding":[0.1,0.2]}]}`)
	d, err := Decode(pipeline.ShapeEmbedding, pipeline.ShapeEmbedding, body)
	if err != nil {
		t.Fatal(err)
	}
	if string(d.Encode("ignored")) != string(body) {
		t.Fatal("embedding body was not passed through")
	}
}

func TestMapModel(t *testing.T) {
	m := map[string]string{"gpt-4o": "claude-sonnet-4-5"}
	if got := MapModel(m, "gpt-4o"); got != "claude-sonnet-4-5" {
		t.Fatalf("mapped = %q", got)
	}
	if got := MapModel(m, "unlisted"); got != "unlisted" {
		t.Fatalf("unlisted model = %q", got)
	}
}

func TestClosestEndpoint(t *testing.T) {
	cases := map[string]pipeline.Shape{
		"/v1/chat/completions": pipeline.ShapeChat,
		"/v1/completions":      pipeline.ShapeCompletion,
		"/v1/embeddings":       pipeline.ShapeEmbedding,
		"/v1/messages":         pipeline.ShapeAnthropic,
	}
	for path, want := range cases {
		if got := ClosestEndpoint(path); got != want {
			t.Errorf("ClosestEndpoint(%q) = %q, want %q", path, got, want)
		}
	}
}
