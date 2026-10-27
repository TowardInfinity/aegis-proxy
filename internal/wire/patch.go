package wire

import (
	"bytes"
	"encoding/json"
	"fmt"

	"guardrail/internal/pipeline"
)

// Patch rewrites the fields the pipeline changed in an existing body, keeping
// every field it does not understand. Rebuilding the body from the internal
// shape would drop tools, response_format, and vendor extensions, so a
// same-wire request is edited in place instead.
//
// The message list is rebuilt only to carry redacted text; other message
// fields such as tool_calls are preserved by index.
func Patch(shape pipeline.Shape, raw []byte, req *pipeline.Request, model string, maxTokens int) ([]byte, error) {
	switch shape {
	case pipeline.ShapeAnthropic:
		return patchAnthropic(raw, req, model, maxTokens)
	default:
		return patchOpenAI(shape, raw, req, model, maxTokens)
	}
}

func patchOpenAI(shape pipeline.Shape, raw []byte, req *pipeline.Request, model string, maxTokens int) ([]byte, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("body is not a JSON object: %w", err)
	}
	doc["model"] = mustJSON(model)
	if shape != pipeline.ShapeEmbedding {
		doc["max_tokens"] = mustJSON(maxTokens)
		doc["temperature"] = mustJSON(req.Temperature)
	} else {
		delete(doc, "max_tokens")
		delete(doc, "temperature")
	}
	if req.Stream {
		doc["stream"] = mustJSON(true)
	} else {
		delete(doc, "stream")
	}

	switch shape {
	case pipeline.ShapeChat:
		var msgs []map[string]json.RawMessage
		if err := json.Unmarshal(doc["messages"], &msgs); err != nil {
			return nil, fmt.Errorf("messages: %w", err)
		}
		// req.Messages is index-aligned with the raw messages for this shape,
		// system turns included, because ParseOpenAI kept the order.
		for i := range msgs {
			if i >= len(req.Messages) {
				break
			}
			// Preserve the multipart form (images, tool results) by editing
			// only the text parts inside it.
			msgs[i]["content"] = replaceContent(msgs[i]["content"], req.Messages[i].Content)
		}
		if req.Nudge {
			nudge := map[string]json.RawMessage{
				"role":    mustJSON("system"),
				"content": mustJSON(pipeline.SoftNudgeText),
			}
			msgs = append([]map[string]json.RawMessage{nudge}, msgs...)
		}
		doc["messages"] = mustJSON(msgs)
	case pipeline.ShapeCompletion:
		doc["prompt"] = replacePrompt(doc["prompt"], firstUserText(req))
	case pipeline.ShapeEmbedding:
		doc["input"] = replacePrompt(doc["input"], firstUserText(req))
	}
	return json.Marshal(doc)
}

func patchAnthropic(raw []byte, req *pipeline.Request, model string, maxTokens int) ([]byte, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("body is not a JSON object: %w", err)
	}
	doc["model"] = mustJSON(model)
	doc["max_tokens"] = mustJSON(maxTokens)
	// Claude Code omits temperature when extended thinking is on, and the API
	// rejects anything but the default there, so only echo an explicit value.
	if req.TemperatureSet {
		doc["temperature"] = mustJSON(req.Temperature)
	}
	if req.Stream {
		doc["stream"] = mustJSON(true)
	} else {
		delete(doc, "stream")
	}

	var msgs []map[string]json.RawMessage
	if len(doc["messages"]) > 0 {
		if err := json.Unmarshal(doc["messages"], &msgs); err != nil {
			return nil, fmt.Errorf("messages: %w", err)
		}
	}
	// Each internal message carries its leaves in wire order, so redacted text
	// goes back into the block it came from. Block structure, cache_control,
	// tool ids, and untouched leaves keep their original bytes, which keeps
	// Anthropic prompt caching intact across turns.
	idx := 0
	changed := false
	for _, m := range req.Messages {
		if m.Role == "system" {
			if m.Parts != nil {
				doc["system"] = applyLeaves(doc["system"], m.Parts)
			}
			continue
		}
		if idx < len(msgs) {
			out := applyLeaves(msgs[idx]["content"], m.Parts)
			if !bytes.Equal(out, msgs[idx]["content"]) {
				msgs[idx]["content"] = out
				changed = true
			}
		}
		idx++
	}
	if changed {
		doc["messages"] = mustJSON(msgs)
	}
	if req.Nudge {
		doc["system"] = appendSystem(doc["system"], pipeline.SoftNudgeText)
	}
	return json.Marshal(doc)
}

// appendSystem adds text after the existing system prompt. Appending, not
// prepending, leaves the cached system prefix unchanged.
func appendSystem(existing json.RawMessage, text string) json.RawMessage {
	switch firstByte(existing) {
	case '"':
		var s string
		_ = json.Unmarshal(existing, &s)
		return mustJSON(s + "\n\n" + text)
	case '[':
		var blocks []json.RawMessage
		if json.Unmarshal(existing, &blocks) == nil {
			return mustJSON(append(blocks, mustJSON(map[string]string{"type": "text", "text": text})))
		}
	}
	return mustJSON(text)
}

// replaceContent keeps a plain string a plain string, and edits the text parts
// of an array in order.
func replaceContent(existing json.RawMessage, text string) json.RawMessage {
	if len(existing) == 0 {
		return mustJSON(text)
	}
	var s string
	if json.Unmarshal(existing, &s) == nil {
		return mustJSON(text)
	}
	var parts []map[string]json.RawMessage
	if json.Unmarshal(existing, &parts) != nil {
		return mustJSON(text)
	}
	var b []ContentPart
	_ = json.Unmarshal(existing, &b)
	remaining := text
	for i := range parts {
		var typ string
		_ = json.Unmarshal(parts[i]["type"], &typ)
		if typ != "text" && typ != "" {
			continue
		}
		var original string
		_ = json.Unmarshal(parts[i]["text"], &original)
		// The flattened text concatenates parts, so hand each part the slice
		// that matches its original length.
		if len(original) <= len(remaining) {
			parts[i]["text"] = mustJSON(remaining[:len(original)])
			remaining = remaining[len(original):]
		} else {
			parts[i]["text"] = mustJSON(remaining)
			remaining = ""
		}
	}
	// Any text left over comes from parts the client sent without a type.
	if remaining != "" && len(parts) > 0 {
		parts[0]["text"] = mustJSON(remaining)
	}
	return mustJSON(parts)
}

func replacePrompt(existing json.RawMessage, text string) json.RawMessage {
	if len(existing) == 0 {
		return mustJSON(text)
	}
	var s string
	if json.Unmarshal(existing, &s) == nil {
		return mustJSON(text)
	}
	var list []string
	if json.Unmarshal(existing, &list) == nil {
		if len(list) > 0 {
			list[0] = text
		}
		return mustJSON(list)
	}
	return mustJSON(text)
}

func firstUserText(req *pipeline.Request) string {
	for _, m := range req.Messages {
		if m.Role != "system" {
			return m.Content
		}
	}
	return ""
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}
