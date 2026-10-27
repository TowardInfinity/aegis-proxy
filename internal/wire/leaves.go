package wire

import (
	"bytes"
	"encoding/json"
	"sort"
)

// Anthropic content (and system) is a string or an array of typed blocks. The
// text a model sees lives in several places: text blocks, tool_result content
// (itself a string or blocks), and the string values of a tool_use input.
// walkContent visits those leaves in one fixed order, so the leaves collected
// on parse line up one-to-one with the leaves written back on patch.
//
// Blocks the proxy must not touch are skipped: thinking and redacted_thinking
// carry signatures the provider verifies, and media blocks have no text.

// leafFunc receives a leaf and returns its replacement.
type leafFunc func(string) string

// collectLeaves returns every text-bearing leaf in walk order. The result is
// never nil, so callers can tell "no leaves" from "not block-structured".
func collectLeaves(raw json.RawMessage) []string {
	leaves := []string{}
	walkContent(raw, func(s string) string {
		leaves = append(leaves, s)
		return s
	})
	return leaves
}

// applyLeaves writes leaves back in walk order. Leaves that did not change
// keep their original bytes, and so does any container with no changed leaf.
func applyLeaves(raw json.RawMessage, leaves []string) json.RawMessage {
	i := 0
	out, _ := walkContent(raw, func(s string) string {
		if i >= len(leaves) {
			return s
		}
		i++
		return leaves[i-1]
	})
	return out
}

func walkContent(raw json.RawMessage, fn leafFunc) (json.RawMessage, bool) {
	switch firstByte(raw) {
	case '"':
		return walkString(raw, fn)
	case '[':
		var blocks []map[string]json.RawMessage
		if json.Unmarshal(raw, &blocks) != nil {
			return raw, false
		}
		changed := false
		for _, blk := range blocks {
			if walkBlock(blk, fn) {
				changed = true
			}
		}
		if !changed {
			return raw, false
		}
		return mustJSON(blocks), true
	}
	return raw, false
}

func walkBlock(blk map[string]json.RawMessage, fn leafFunc) bool {
	var typ string
	_ = json.Unmarshal(blk["type"], &typ)
	field, walk := "", walkContent
	switch typ {
	case "text":
		field = "text"
	case "tool_result":
		field = "content"
	case "tool_use", "server_tool_use":
		field, walk = "input", walkAny
	default:
		return false
	}
	v, ok := blk[field]
	if !ok {
		return false
	}
	out, changed := walk(v, fn)
	if changed {
		blk[field] = out
	}
	return changed
}

// walkAny visits every string in arbitrary JSON, object keys in sorted order.
func walkAny(raw json.RawMessage, fn leafFunc) (json.RawMessage, bool) {
	switch firstByte(raw) {
	case '"':
		return walkString(raw, fn)
	case '{':
		var obj map[string]json.RawMessage
		if json.Unmarshal(raw, &obj) != nil {
			return raw, false
		}
		keys := make([]string, 0, len(obj))
		for k := range obj {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		changed := false
		for _, k := range keys {
			if out, c := walkAny(obj[k], fn); c {
				obj[k], changed = out, true
			}
		}
		if !changed {
			return raw, false
		}
		return mustJSON(obj), true
	case '[':
		var arr []json.RawMessage
		if json.Unmarshal(raw, &arr) != nil {
			return raw, false
		}
		changed := false
		for i := range arr {
			if out, c := walkAny(arr[i], fn); c {
				arr[i], changed = out, true
			}
		}
		if !changed {
			return raw, false
		}
		return mustJSON(arr), true
	}
	return raw, false
}

func walkString(raw json.RawMessage, fn leafFunc) (json.RawMessage, bool) {
	var s string
	if json.Unmarshal(raw, &s) != nil {
		return raw, false
	}
	out := fn(s)
	if out == s {
		return raw, false
	}
	return mustJSON(out), true
}

func firstByte(raw json.RawMessage) byte {
	trimmed := bytes.TrimLeft(raw, " \t\r\n")
	if len(trimmed) == 0 {
		return 0
	}
	return trimmed[0]
}
