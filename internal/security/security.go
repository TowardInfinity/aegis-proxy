// Package security is the validate stage. Every detector scores rather than
// deciding, so the same scan can block at one threshold and flag at another.
package security

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Default thresholds. Config may override per family.
const (
	BlockThreshold = 0.8
	FlagThreshold  = 0.5
)

// Hit is one detector firing with its score and a short sample. security does
// not import pipeline: the orchestrator maps these into audit rows.
type Hit struct {
	Rule   string
	Score  float64
	Sample string
}

// Rule is one compiled detector: a regex plus a weight. The strongest rule in a
// family sets that family's score, so overlapping phrasings do not stack to a
// false positive.
type Rule struct {
	Name   string
	Re     *regexp.Regexp
	Weight float64
}

// Family is a named detector group with its own block threshold.
type Family struct {
	Name       string
	Rules      []Rule
	Threshold  float64
	Normalizer bool
}

var (
	injectionRules = []Rule{
		{Name: "ignore_previous", Re: regexp.MustCompile(`(?i)ignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|preceding|earlier)\s+(?:instructions|prompts?|directions|rules)`), Weight: 1.0},
		{Name: "disregard_above", Re: regexp.MustCompile(`(?i)disregard\s+(?:all\s+)?(?:the\s+)?(?:above|previous|prior|everything)`), Weight: 1.0},
		{Name: "system_prompt_label", Re: regexp.MustCompile(`(?i)\bsystem\s+prompt\s*:`), Weight: 0.9},
		{Name: "you_are_now", Re: regexp.MustCompile(`(?i)\byou\s+are\s+now\b`), Weight: 0.9},
		{Name: "act_as", Re: regexp.MustCompile(`(?i)\b(?:act|behave|pretend)\s+(?:as|to\s+be)\b`), Weight: 0.55},
		{Name: "reveal_instructions", Re: regexp.MustCompile(`(?i)\b(?:reveal|show|print|output|repeat|display|leak)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+)?(?:instructions|prompt|rules|guidelines)`), Weight: 0.95},
		{Name: "repeat_everything_above", Re: regexp.MustCompile(`(?i)\brepeat\s+(?:everything|all|the\s+text|the\s+messages?)\s+(?:above|before|prior)`), Weight: 0.95},
		{Name: "everything_above_is", Re: regexp.MustCompile(`(?i)\b(?:everything|all\s+the\s+text)\s+above\s+is\b`), Weight: 0.85},
		{Name: "new_instructions", Re: regexp.MustCompile(`(?i)\b(?:new|updated|real|actual)\s+instructions\s*[:=]`), Weight: 0.85},
		{Name: "jailbreak_dan", Re: regexp.MustCompile(`(?i)\bDAN\b|\bdo\s+anything\s+now\b`), Weight: 1.0},
		{Name: "developer_mode", Re: regexp.MustCompile(`(?i)\b(?:developer|god|sudo|unrestricted|jailbreak)\s+mode\b`), Weight: 0.95},
		{Name: "no_restrictions", Re: regexp.MustCompile(`(?i)\b(?:no|without\s+any|zero)\s+(?:restrictions|limitations|filters|rules|guardrails|ethical\s+guidelines)\b`), Weight: 0.9},
		{Name: "bypass_safety", Re: regexp.MustCompile(`(?i)\b(?:bypass|disable|turn\s+off|ignore)\s+(?:your\s+)?(?:safety|content|moderation|filter|censorship)`), Weight: 0.9},
		{Name: "delimiter_injection", Re: regexp.MustCompile(`(?i)(?:<\|im_start\|>|<\|system\|>|\[/?INST\]|<<SYS>>)`), Weight: 0.8},
	}

	jailbreakRules = []Rule{
		{Name: "jailbreak_dan", Re: regexp.MustCompile(`(?i)\bDAN\b|\bdo\s+anything\s+now\b`), Weight: 1.0},
		{Name: "developer_mode", Re: regexp.MustCompile(`(?i)\bdeveloper\s+mode\b`), Weight: 0.95},
		{Name: "no_restrictions", Re: regexp.MustCompile(`(?i)\b(?:no|without\s+any|zero)\s+(?:restrictions|limitations|filters|ethical\s+guidelines)\b`), Weight: 0.85},
		{Name: "pretend_unfiltered", Re: regexp.MustCompile(`(?i)\bpretend\s+(?:you\s+(?:are|have)|to\s+be)\b.{0,40}\b(?:unfiltered|uncensored|unrestricted)\b`), Weight: 0.95},
		{Name: "stay_in_character", Re: regexp.MustCompile(`(?i)\bstay\s+in\s+character\b.{0,40}\b(?:jailbreak|DAN|unrestricted)\b`), Weight: 0.85},
	}
)

// Detector runs the compiled families over normalized text.
type Detector struct {
	Families map[string][]Rule
}

// NewDetector returns the default family table. Families is exposed so tests
// can swap a rule set.
func NewDetector() *Detector {
	return &Detector{Families: map[string][]Rule{
		"injection": injectionRules,
		"jailbreak": jailbreakRules,
	}}
}

// Score is the strongest rule hit in a named family, plus that family's rule
// hits. Zero means no hit.
func (d *Detector) Score(family, text string) (float64, []Hit) {
	rules, ok := d.Families[family]
	if !ok {
		return 0, nil
	}
	normalized := NormalizeText(text)
	best := 0.0
	var hits []Hit
	for _, r := range rules {
		loc := r.Re.FindStringIndex(normalized)
		if loc == nil {
			continue
		}
		if r.Weight > best {
			best = r.Weight
		}
		hits = append(hits, Hit{Rule: r.Name, Score: r.Weight, Sample: sample(normalized[loc[0]:loc[1]])})
	}
	return best, hits
}

// NormalizeText strips zero-width characters and folds the common homoglyph
// alphabets that evasion prompts use. It returns an ASCII-ish string so the
// rules match normalized text, not the raw bytes.
func NormalizeText(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		switch {
		case r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff' || (r >= '\u2060' && r <= '\u206f'):
			continue
		case r == '\u00a0':
			b.WriteByte(' ')
		case r >= '\u2010' && r <= '\u2015':
			b.WriteByte('-')
		case r == '\u2018' || r == '\u2019':
			b.WriteByte('\'')
		case r == '\u201c' || r == '\u201d':
			b.WriteByte('"')
		default:
			if folded, ok := foldHomoglyph(r); ok {
				b.WriteRune(folded)
				continue
			}
			b.WriteRune(r)
		}
	}
	return b.String()
}

// foldHomoglyph maps Cyrillic and Greek letters that are visually identical to
// Latin ones back to their Latin twin.
func foldHomoglyph(r rune) (rune, bool) {
	switch r {
	// Cyrillic
	case 'а':
		return 'a', true
	case 'е':
		return 'e', true
	case 'о':
		return 'o', true
	case 'р':
		return 'p', true
	case 'с':
		return 'c', true
	case 'х':
		return 'x', true
	case 'у':
		return 'y', true
	case 'і':
		return 'i', true
	case 'ѕ':
		return 's', true
	case 'ј':
		return 'j', true
	case 'А':
		return 'A', true
	case 'В':
		return 'B', true
	case 'Е':
		return 'E', true
	case 'К':
		return 'K', true
	case 'М':
		return 'M', true
	case 'Н':
		return 'H', true
	case 'О':
		return 'O', true
	case 'Р':
		return 'P', true
	case 'С':
		return 'C', true
	case 'Т':
		return 'T', true
	case 'Х':
		return 'X', true
	// Greek
	case 'α':
		return 'a', true
	case 'ο':
		return 'o', true
	case 'ι':
		return 'i', true
	case 'κ':
		return 'k', true
	case 'ν':
		return 'v', true
	case 'Α':
		return 'A', true
	case 'Β':
		return 'B', true
	case 'Ε':
		return 'E', true
	case 'Ζ':
		return 'Z', true
	case 'Η':
		return 'H', true
	case 'Ι':
		return 'I', true
	case 'Κ':
		return 'K', true
	case 'Μ':
		return 'M', true
	case 'Ν':
		return 'N', true
	case 'Ο':
		return 'O', true
	case 'Ρ':
		return 'P', true
	case 'Τ':
		return 'T', true
	case 'Υ':
		return 'Y', true
	case 'Χ':
		return 'X', true
	}
	return 0, false
}

// Obfuscation reports whether text carries zero-width characters or homoglyph
// substitutions in a dense enough run to look deliberate.
func Obfuscation(text string) (float64, []Hit) {
	zw, homo := 0, 0
	for _, r := range text {
		switch {
		case r == '\u200b' || r == '\u200c' || r == '\u200d' || r == '\ufeff':
			zw++
		default:
			if _, ok := foldHomoglyph(r); ok {
				homo++
			}
		}
	}
	if zw == 0 && homo == 0 {
		return 0, nil
	}
	var hits []Hit
	score := 0.0
	if zw > 0 {
		s := 0.6
		if zw >= 3 {
			s = 0.9
		}
		score = s
		hits = append(hits, Hit{Rule: "zero_width_chars", Score: s, Sample: fmt.Sprintf("%d zero-width chars", zw)})
	}
	if homo > 0 {
		s := 0.5
		if homo >= 4 {
			s = 0.85
		}
		if s > score {
			score = s
		}
		hits = append(hits, Hit{Rule: "homoglyphs", Score: s, Sample: fmt.Sprintf("%d look-alike letters", homo)})
	}
	return score, hits
}

// Verdict is the scan outcome for a request.
type Verdict struct {
	Block       bool
	Stage       string
	Score       float64
	Family      string
	Hits        []Hit
	MonitorOnly bool
}

// ScanRequest runs injection, jailbreak, and obfuscation detectors. Thresholds
// come from overrides (family name -> block threshold, zero means default).
func ScanRequest(d *Detector, text string, thresholds map[string]float64, monitor bool) Verdict {
	var v Verdict
	consider := func(family string, score float64, hits []Hit) {
		if len(hits) == 0 {
			return
		}
		threshold := thresholds[family]
		if threshold == 0 {
			threshold = BlockThreshold
		}
		v.Hits = append(v.Hits, hits...)
		if score > v.Score {
			v.Score = score
			v.Family = family
			v.Stage = "validate"
		}
		if score >= threshold {
			v.Block = true
		}
	}
	for _, family := range []string{"injection", "jailbreak"} {
		score, hits := d.Score(family, text)
		consider(family, score, hits)
	}
	score, hits := Obfuscation(text)
	consider("injection", score, hits)
	if monitor {
		v.MonitorOnly = v.Block
		v.Block = false
	}
	return v
}

// NearThreshold reports whether any hit lands in the flag-only band.
func NearThreshold(hits []Hit) bool {
	return hasScore(hits, FlagThreshold)
}

func hasScore(hits []Hit, floor float64) bool {
	for _, h := range hits {
		if h.Score >= floor {
			return true
		}
	}
	return false
}

// Request is the slice of the internal request the schema check reads.
// security keeps its own view so it never imports pipeline.
type Request struct {
	Model       string
	Messages    []Message
	MaxTokens   int
	Temperature float64
	BodyBytes   int
}

// Message is one conversational turn.
type Message struct {
	Role    string
	Content string
}

// Schema validates the normalized request against config limits. It returns a
// 400-shaped reason on failure.
func Schema(req Request, maxTokens, maxBodyBytes int) error {
	if maxBodyBytes > 0 && req.BodyBytes > maxBodyBytes {
		return fmt.Errorf("request body %d bytes exceeds max_body_bytes %d", req.BodyBytes, maxBodyBytes)
	}
	for i, m := range req.Messages {
		switch m.Role {
		case "system", "user", "assistant", "tool":
		default:
			return fmt.Errorf("messages[%d].role %q is not system, user, assistant, or tool", i, m.Role)
		}
	}
	if len(req.Messages) == 0 {
		return fmt.Errorf("messages must not be empty")
	}
	if req.MaxTokens < 0 {
		return fmt.Errorf("max_tokens must be non-negative")
	}
	if maxTokens > 0 && req.MaxTokens > maxTokens {
		return fmt.Errorf("max_tokens %d exceeds the configured ceiling %d", req.MaxTokens, maxTokens)
	}
	if req.Temperature < 0 || req.Temperature > 2 {
		return fmt.Errorf("temperature %.2f is outside [0, 2]", req.Temperature)
	}
	if req.Model == "" {
		return fmt.Errorf("model is required")
	}
	return nil
}

// Bucket is a token bucket, lazily refilled by elapsed time.
type Bucket struct {
	mu     sync.Mutex
	tokens float64
	rate   float64
	burst  float64
	last   time.Time
}

// NewBucket allows ratePerMin tokens per minute with a burst of ratePerMin.
func NewBucket(ratePerMin int) *Bucket {
	if ratePerMin <= 0 {
		return nil
	}
	return &Bucket{tokens: float64(ratePerMin), rate: float64(ratePerMin) / 60, burst: float64(ratePerMin), last: time.Now()}
}

// Allow consumes one token if available.
func (b *Bucket) Allow() bool {
	if b == nil {
		return true
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	now := time.Now()
	b.tokens += now.Sub(b.last).Seconds() * b.rate
	if b.tokens > b.burst {
		b.tokens = b.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// Limiter owns one bucket per key and per client IP.
type Limiter struct {
	mu      sync.Mutex
	perKey  map[string]*Bucket
	perIP   map[string]*Bucket
	keyRate int
	ipRate  int
}

// NewLimiter returns a limiter with the given per-minute rates. Zero disables
// that dimension.
func NewLimiter(keyRate, ipRate int) *Limiter {
	return &Limiter{perKey: map[string]*Bucket{}, perIP: map[string]*Bucket{}, keyRate: keyRate, ipRate: ipRate}
}

// Allow reports whether the key and IP may proceed. key is the bearer token
// value, or "anonymous" when the client sent none.
func (l *Limiter) Allow(key, ip string) bool {
	if l.keyRate > 0 {
		if !l.bucket(&l.perKey, key, l.keyRate).Allow() {
			return false
		}
	}
	if l.ipRate > 0 && ip != "" {
		if !l.bucket(&l.perIP, ip, l.ipRate).Allow() {
			return false
		}
	}
	return true
}

func (l *Limiter) bucket(m *map[string]*Bucket, id string, rate int) *Bucket {
	l.mu.Lock()
	defer l.mu.Unlock()
	if b, ok := (*m)[id]; ok {
		return b
	}
	b := NewBucket(rate)
	(*m)[id] = b
	return b
}

// Purge drops empty buckets so a long-running proxy does not grow one bucket
// per key forever. Call it on a timer.
func (l *Limiter) Purge() {
	l.mu.Lock()
	defer l.mu.Unlock()
	for k, b := range l.perKey {
		b.mu.Lock()
		full := b.tokens >= b.burst-0.001
		b.mu.Unlock()
		if full {
			delete(l.perKey, k)
		}
	}
	for k, b := range l.perIP {
		b.mu.Lock()
		full := b.tokens >= b.burst-0.001
		b.mu.Unlock()
		if full {
			delete(l.perIP, k)
		}
	}
}

func sample(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}
