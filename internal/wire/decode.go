package wire

import (
	"encoding/json"
	"time"

	"guardrail/internal/pipeline"
)

// Decode reduces a response body. upstream is the route's wire, client is the
// shape the caller speaks; when they differ the returned encoder builds a
// fresh envelope in the client shape.
func Decode(upstream, client pipeline.Shape, raw []byte) (pipeline.Decoded, error) {
	switch upstream {
	case pipeline.ShapeAnthropic:
		return decodeAnthropic(upstream, client, raw)
	default:
		return decodeOpenAI(upstream, client, raw)
	}
}

func decodeOpenAI(upstream, client pipeline.Shape, raw []byte) (pipeline.Decoded, error) {
	if client == pipeline.ShapeEmbedding || upstream == pipeline.ShapeEmbedding {
		in, out := usageOpenAI(raw)
		return pipeline.Decoded{InputTokens: in, OutputTokens: out, Encode: func(string) []byte { return raw }}, nil
	}
	var resp OpenAIResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return pipeline.Decoded{}, err
	}
	text := openAIText(&resp)
	in, out := usageOpenAI(raw)

	if client == pipeline.ShapeAnthropic {
		// The client expects Anthropic's envelope, so the OpenAI fields map
		// across instead of being passed through.
		return pipeline.Decoded{Text: text, InputTokens: in, OutputTokens: out, Encode: func(newText string) []byte {
			return anthropicEnvelope(text, newText, in, out)
		}}, nil
	}
	return pipeline.Decoded{Text: text, InputTokens: in, OutputTokens: out, Encode: func(newText string) []byte {
		if newText == text {
			return raw
		}
		out, _, _, err := EncodeOpenAIResult(client, raw, func(string) string { return newText })
		if err != nil {
			return raw
		}
		return out
	}}, nil
}

func decodeAnthropic(upstream, client pipeline.Shape, raw []byte) (pipeline.Decoded, error) {
	text, in, out, err := ParseAnthropicResponse(raw)
	if err != nil {
		return pipeline.Decoded{}, err
	}
	if client == pipeline.ShapeAnthropic {
		return pipeline.Decoded{Text: text, InputTokens: in, OutputTokens: out, Encode: func(newText string) []byte {
			if newText == text {
				return raw
			}
			b, _, _, err := EncodeAnthropicResponse(raw, func(string) string { return newText })
			if err != nil {
				return raw
			}
			return b
		}}, nil
	}
	return pipeline.Decoded{Text: text, InputTokens: in, OutputTokens: out, Encode: func(newText string) []byte {
		return openAIEnvelope(text, newText, in, out)
	}}, nil
}

func openAIText(resp *OpenAIResponse) string {
	out := ""
	for _, c := range resp.Choices {
		if c.Text != "" {
			out += c.Text
			continue
		}
		if len(c.Message.Content) > 0 {
			var s string
			if json.Unmarshal(c.Message.Content, &s) == nil {
				out += s
			}
		}
	}
	return out
}

func usageOpenAI(raw []byte) (int, int) {
	var resp OpenAIResponse
	if json.Unmarshal(raw, &resp) != nil || resp.Usage == nil {
		return 0, 0
	}
	return resp.Usage.PromptTokens, resp.Usage.CompletionTokens
}

// anthropicEnvelope builds a Messages response for an OpenAI upstream result.
func anthropicEnvelope(oldText, newText string, in, out int) []byte {
	text := newText
	if newText == oldText {
		text = oldText
	}
	body := map[string]any{
		"id":      "msg_guardrail",
		"type":    "message",
		"role":    "assistant",
		"model":   "guardrail",
		"content": []map[string]any{{"type": "text", "text": text}},
		"usage":   map[string]int{"input_tokens": in, "output_tokens": out},
	}
	b, _ := json.Marshal(body)
	return b
}

// openAIEnvelope builds a chat.completion response for an Anthropic upstream
// result.
func openAIEnvelope(oldText, newText string, in, out int) []byte {
	text := newText
	if newText == oldText {
		text = oldText
	}
	body := map[string]any{
		"id":      "chatcmpl-guardrail",
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   "guardrail",
		"choices": []map[string]any{{
			"index":         0,
			"message":       map[string]string{"role": "assistant", "content": text},
			"finish_reason": "stop",
		}},
		"usage": map[string]int{"prompt_tokens": in, "completion_tokens": out, "total_tokens": in + out},
	}
	b, _ := json.Marshal(body)
	return b
}
