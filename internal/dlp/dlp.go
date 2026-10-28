// Package dlp detects sensitive values, replaces them with reversible tokens,
// and restores them on the way back.
//
// The three parts are deliberately separate types. Detector is a pure scan
// over text. Vault owns the token lifecycle (per-request map plus a
// cross-request memo so the same value keeps the same token). Rewrite is a
// pure inverse of Redact over a token->value map.
package dlp

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Match is one detector hit with its byte span. Value is the text that gets
// replaced, which for key=value detectors is only the value part.
type Match struct {
	Type  string
	Rule  string
	Score float64
	Start int
	End   int
	Value string
}

// Hit is one redaction as the audit log records it. dlp stays free of the
// pipeline package so it can be tested as a pure text transform.
type Hit struct {
	Rule   string
	Score  float64
	Sample string
}

// Detector is a compiled scan function over text.
type Detector struct {
	Type string
	Scan func(text string) []Match
}

// Detectors returns the detectors named in cfg. An unknown name is a config
// error caught at the boundary; here it is skipped.
func Detectors(names []string) []Detector {
	out := make([]Detector, 0, len(names))
	for _, n := range names {
		if d, ok := catalog[n]; ok {
			out = append(out, d)
		}
	}
	return out
}

// Scan runs every detector and returns non-overlapping matches ordered by
// position. A longer span wins an overlap. The same span keeps the higher score.
func Scan(dets []Detector, text string) []Match {
	var all []Match
	for _, d := range dets {
		all = append(all, d.Scan(text)...)
	}
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].Start != all[j].Start {
			return all[i].Start < all[j].Start
		}
		if all[i].End != all[j].End {
			return all[i].End > all[j].End
		}
		return all[i].Score > all[j].Score
	})
	out := all[:0]
	last := 0
	for _, m := range all {
		if m.Start < last || m.End <= m.Start {
			continue
		}
		out = append(out, m)
		last = m.End
	}
	return out
}

var catalog = map[string]Detector{
	"email":          {Type: "EMAIL", Scan: scanEmail},
	"phone":          {Type: "PHONE", Scan: scanPhone},
	"ssn":            {Type: "SSN", Scan: scanSSN},
	"credit_card":    {Type: "CREDIT_CARD", Scan: scanCreditCard},
	"aws_key":        {Type: "AWS_KEY", Scan: scanAWSKey},
	"jwt":            {Type: "JWT", Scan: scanJWT},
	"private_key":    {Type: "PRIVATE_KEY", Scan: scanPrivateKey},
	"iban":           {Type: "IBAN", Scan: scanIBAN},
	"generic_secret": {Type: "GENERIC_SECRET", Scan: scanGenericSecret},
}

var (
	reEmail = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	rePhone = regexp.MustCompile(`\+?\d[\d\s().\-]{7,18}\d`)
	// reDate matches a leading calendar date (2026-10-28, 28-10-2026,
	// 10/28/2026), which the phone pattern would otherwise swallow.
	reDate = regexp.MustCompile(`^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})`)
	reSSN  = regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`)
	reCard = regexp.MustCompile(`\b(?:\d[ \-]?){12,18}\d\b`)
	reAWS  = regexp.MustCompile(`\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|AIPA)[A-Z0-9]{16}\b`)
	reJWT  = regexp.MustCompile(`\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\b`)
	rePriv = regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`)
	// Compact, or groups of four separated by a single space with an optional
	// final group of 1-4. The checksum sees the text with spaces removed.
	reIBAN = regexp.MustCompile(`\b[A-Z]{2}\d{2}(?:[A-Z0-9]{10,30}|(?: [A-Z0-9]{4})+(?: [A-Z0-9]{1,4})?)\b`)

	// The value group is what gets tokenized; keying on the assignment keeps
	// "api_key=" from matching prose that merely mentions the word. The
	// keyword may sit inside an identifier, as .env files name them
	// (DB_PASSWORD, STRIPE_SECRET_KEY, OPENAI_API_KEY).
	reSecretKV = regexp.MustCompile(`(?i)\b\w*(?:password|passwd|pwd|api_?key|client_secret|secret|access_?token|auth_?token|private_?key)\w*\s*[:=]\s*["']?([^\s"',;]{6,})`)
	reBearer   = regexp.MustCompile(`(?i)\bbearer\s+([A-Za-z0-9\-._~+/]{16,}=*)`)
	reConnStr  = regexp.MustCompile(`(?i)\b[a-z]+\+?[a-z]*://[^\s:/@]+:[^\s@/]+@`)
)

func scanEmail(text string) []Match {
	return eachMatch(text, reEmail, "EMAIL", "email", 0.95)
}

func scanPhone(text string) []Match {
	var out []Match
	for _, m := range rePhone.FindAllStringIndex(text, -1) {
		digits := countDigits(text[m[0]:m[1]])
		if digits < 7 || digits > 15 {
			continue
		}
		// A bare digit run is more likely an ID than a phone number, so require
		// a separator, a plus or an international 00 prefix. Dates have
		// separators too; agents send today's date in every system prompt.
		raw := text[m[0]:m[1]]
		if !strings.HasPrefix(raw, "+") && !strings.ContainsAny(raw, " ()-") && !strings.HasPrefix(raw, "00") {
			continue
		}
		if reDate.MatchString(raw) {
			continue
		}
		out = append(out, Match{Type: "PHONE", Rule: "phone", Score: 0.6, Start: m[0], End: m[1], Value: raw})
	}
	return out
}

func scanSSN(text string) []Match {
	return eachMatch(text, reSSN, "SSN", "ssn", 0.9)
}

func scanCreditCard(text string) []Match {
	var out []Match
	for _, m := range reCard.FindAllStringIndex(text, -1) {
		raw := text[m[0]:m[1]]
		if !Luhn(raw) {
			continue
		}
		out = append(out, Match{Type: "CREDIT_CARD", Rule: "credit_card", Score: 0.99, Start: m[0], End: m[1], Value: raw})
	}
	return out
}

func scanAWSKey(text string) []Match {
	return eachMatch(text, reAWS, "AWS_KEY", "aws_key", 0.99)
}

func scanJWT(text string) []Match {
	return eachMatch(text, reJWT, "JWT", "jwt", 0.95)
}

func scanPrivateKey(text string) []Match {
	return eachMatch(text, rePriv, "PRIVATE_KEY", "private_key", 0.99)
}

func scanIBAN(text string) []Match {
	var out []Match
	for _, m := range reIBAN.FindAllStringIndex(text, -1) {
		raw := text[m[0]:m[1]]
		if !validIBAN(strings.ReplaceAll(raw, " ", "")) {
			continue
		}
		out = append(out, Match{Type: "IBAN", Rule: "iban", Score: 0.85, Start: m[0], End: m[1], Value: raw})
	}
	return out
}

func scanGenericSecret(text string) []Match {
	var out []Match
	for _, m := range reSecretKV.FindAllStringSubmatchIndex(text, -1) {
		start, end := m[2], m[3]
		if isPlaceholder(text[start:end]) {
			continue
		}
		out = append(out, Match{Type: "GENERIC_SECRET", Rule: "generic_secret", Score: 0.7, Start: start, End: end, Value: text[start:end]})
	}
	for _, m := range reBearer.FindAllStringSubmatchIndex(text, -1) {
		start, end := m[2], m[3]
		if isPlaceholder(text[start:end]) {
			continue
		}
		out = append(out, Match{Type: "GENERIC_SECRET", Rule: "bearer_token", Score: 0.75, Start: start, End: end, Value: text[start:end]})
	}
	for _, m := range reConnStr.FindAllStringSubmatchIndex(text, -1) {
		seg := text[m[0]:m[1]]
		at := strings.LastIndex(seg, "@")
		slash := strings.Index(seg, "://")
		if at < 0 || slash < 0 || at <= slash {
			continue
		}
		start := m[0] + slash + 3
		out = append(out, Match{Type: "GENERIC_SECRET", Rule: "connection_string", Score: 0.8, Start: start, End: start + at - slash - 3, Value: text[start : start+at-slash-3]})
	}
	return out
}

func eachMatch(text string, re *regexp.Regexp, typ, rule string, score float64) []Match {
	var out []Match
	for _, m := range re.FindAllStringIndex(text, -1) {
		out = append(out, Match{Type: typ, Rule: rule, Score: score, Start: m[0], End: m[1], Value: text[m[0]:m[1]]})
	}
	return out
}

func isPlaceholder(v string) bool {
	switch strings.ToLower(v) {
	case "changeme", "xxx", "xxxx", "none", "null", "true", "false", "example", "redacted":
		return true
	}
	if strings.HasPrefix(v, "⟦PII:") {
		return true
	}
	// Lowercase words with no digit are prose, not secrets.
	return !strings.ContainsAny(v, "0123456789") && v == strings.ToLower(v) && !strings.ContainsAny(v, "!@#$%^&*")
}

func countDigits(s string) int {
	n := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}

// Luhn reports whether a card-looking string passes the Luhn checksum.
func Luhn(s string) bool {
	digits := make([]int, 0, len(s))
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits = append(digits, int(r-'0'))
		}
	}
	if len(digits) < 13 || len(digits) > 19 {
		return false
	}
	sum := 0
	double := false
	for i := len(digits) - 1; i >= 0; i-- {
		d := digits[i]
		if double {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		sum += d
		double = !double
	}
	return sum%10 == 0
}

func validIBAN(s string) bool {
	if len(s) < 15 || len(s) > 34 {
		return false
	}
	rearranged := s[4:] + s[:4]
	sum := 0
	for _, r := range rearranged {
		var v int
		switch {
		case r >= '0' && r <= '9':
			v = int(r - '0')
			sum = (sum*10 + v) % 97
		case r >= 'A' && r <= 'Z':
			v = int(r-'A') + 10
			sum = (sum*100 + v) % 97
		default:
			return false
		}
	}
	return sum == 1
}

// Token is the reversible placeholder shape. ReToken recognizes it on the way
// back, including tokens the vault does not know.
var ReToken = regexp.MustCompile(`⟦PII:([A-Z_]+):(\d+)⟧`)

// FormatToken renders the placeholder for a type and sequence number.
func FormatToken(typ string, n int) string {
	return "⟦PII:" + typ + ":" + itoa(n) + "⟧"
}

// Vault assigns tokens. The counters are process-global so a value seen in an
// earlier request resolves to the same token now, which is what lets a
// multi-turn conversation keep referring to it.
type Vault struct {
	mu        sync.Mutex
	entries   map[string]*list.Element
	order     *list.List
	ttl       time.Duration
	cap       int
	counters  map[string]*atomic.Int64
	counterMu sync.Mutex
}

type memoEntry struct {
	key   string
	token string
	exp   time.Time
}

// NewVault builds a memo vault with the given TTL and capacity.
func NewVault(ttl time.Duration, capacity int) *Vault {
	if ttl <= 0 {
		ttl = time.Hour
	}
	if capacity <= 0 {
		capacity = 10000
	}
	return &Vault{
		entries:  make(map[string]*list.Element),
		order:    list.New(),
		ttl:      ttl,
		cap:      capacity,
		counters: make(map[string]*atomic.Int64),
	}
}

func (v *Vault) counter(typ string) *atomic.Int64 {
	v.counterMu.Lock()
	defer v.counterMu.Unlock()
	if c, ok := v.counters[typ]; ok {
		return c
	}
	c := &atomic.Int64{}
	v.counters[typ] = c
	return c
}

// TokenFor returns the stable token for value, allocating one on first sight.
func (v *Vault) TokenFor(typ, value string) string {
	key := hashValue(value)
	v.mu.Lock()
	if el, ok := v.entries[key]; ok {
		e := el.Value.(*memoEntry)
		if time.Now().Before(e.exp) {
			v.order.MoveToFront(el)
			v.mu.Unlock()
			return e.token
		}
		v.order.Remove(el)
		delete(v.entries, key)
	}
	v.mu.Unlock()

	token := FormatToken(typ, int(v.counter(typ).Add(1)))

	v.mu.Lock()
	defer v.mu.Unlock()
	if el, ok := v.entries[key]; ok {
		// A concurrent Redact of the same value won the race; keep its token
		// so both callers see one token for one value.
		return el.Value.(*memoEntry).token
	}
	v.entries[key] = v.order.PushFront(&memoEntry{key: key, token: token, exp: time.Now().Add(v.ttl)})
	for v.order.Len() > v.cap {
		oldest := v.order.Back()
		if oldest == nil {
			break
		}
		v.order.Remove(oldest)
		delete(v.entries, oldest.Value.(*memoEntry).key)
	}
	return token
}

// Size reports the current memo occupancy, for tests and stats.
func (v *Vault) Size() int {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.order.Len()
}

func hashValue(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

// Redactor applies a detector set and a vault to one piece of text.
type Redactor struct {
	Detectors []Detector
	Vault     *Vault
}

// Redact replaces every match with its token and returns the token->value map
// plus the rule hits for the audit log.
func (r *Redactor) Redact(text string) (string, map[string]string, []Hit) {
	matches := Scan(r.Detectors, text)
	if len(matches) == 0 {
		return text, nil, nil
	}
	var b strings.Builder
	redactions := make(map[string]string, len(matches))
	hits := make([]Hit, 0, len(matches))
	pos := 0
	for _, m := range matches {
		token := r.Vault.TokenFor(m.Type, m.Value)
		b.WriteString(text[pos:m.Start])
		b.WriteString(token)
		pos = m.End
		if _, seen := redactions[token]; !seen {
			redactions[token] = m.Value
			hits = append(hits, Hit{Rule: m.Rule, Score: m.Score, Sample: mask(m.Value)})
		}
	}
	b.WriteString(text[pos:])
	return b.String(), redactions, hits
}

// Rewrite restores known tokens and returns the tokens it did not know, which
// the caller audits but never fails on.
func Rewrite(text string, redactions map[string]string) (string, []string) {
	if !strings.Contains(text, "⟦PII:") {
		return text, nil
	}
	var unknown []string
	out := ReToken.ReplaceAllStringFunc(text, func(tok string) string {
		if orig, ok := redactions[tok]; ok {
			return orig
		}
		unknown = append(unknown, tok)
		return tok
	})
	return out, unknown
}

// HasToken reports whether text contains any token shape.
func HasToken(text string) bool { return strings.Contains(text, "⟦PII:") }

func mask(v string) string {
	if len(v) <= 4 {
		return "****"
	}
	return v[:2] + strings.Repeat("*", 4)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
