package dlp

import (
	"strings"
	"testing"
	"time"
)

func scanOne(t *testing.T, detector, text string) []Match {
	t.Helper()
	return Scan(Detectors([]string{detector}), text)
}

func TestDetectorsHitAndMiss(t *testing.T) {
	tests := []struct {
		detector string
		hit      string
		miss     string
	}{
		{"email", "write to jane.doe@example.com", "write to jane dot doe at example"},
		{"phone", "call +1 (415) 555-0134", "call me"},
		{"ssn", "ssn 123-45-6789", "ssn 12-345-678"},
		{"credit_card", "card 4111 1111 1111 1111", "card 4111 1111 1111 1112"},
		{"aws_key", "key AKIAIOSFODNN7EXAMPLE", "key AKAIOSFODNN7EXAMPLE"},
		{"jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk", "token eyJshort"},
		{"private_key", "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----", "BEGIN PUBLIC KEY"},
		{"iban", "iban DE89370400440532013000", "iban DE89370400440532013001"},
		{"generic_secret", "password=hunter2alpha", "password=your-password-here"},
	}
	for _, tt := range tests {
		t.Run(tt.detector, func(t *testing.T) {
			hits := scanOne(t, tt.detector, tt.hit)
			if len(hits) == 0 {
				t.Fatalf("%s: no hit for %q", tt.detector, tt.hit)
			}
			for _, h := range hits {
				if h.Score <= 0 || h.Type == "" || h.Value == "" {
					t.Fatalf("%s: malformed match %+v", tt.detector, h)
				}
			}
			if misses := scanOne(t, tt.detector, tt.miss); len(misses) != 0 {
				t.Fatalf("%s: false positive on %q: %+v", tt.detector, tt.miss, misses)
			}
		})
	}
}

func TestGenericSecretVariants(t *testing.T) {
	dets := Detectors([]string{"generic_secret"})
	for _, text := range []string{
		`api_key = "sk_live_9f8a7b6c5d4e"`,
		"client_secret: AbCdEf123456",
		"Authorization: bearer abcdefghijklmnopqrstuvwxyz012345",
		"DB_PASSWORD=hunter2secret9",
		"export OPENAI_API_KEY=abc123def456ghi", // gitleaks:allow
		"STRIPE_SECRET_KEY=live51Habc123def456", // gitleaks:allow
		"GITHUB_ACCESS_TOKEN: abcdef123456",     // gitleaks:allow
		"postgres://admin:s3cr3tpass@db.internal:5432/app",
	} {
		if got := Scan(dets, text); len(got) == 0 {
			t.Errorf("no generic_secret match in %q", text)
		}
	}
	for _, text := range []string{"password=changeme", "api_key=redacted", `secret_key = "example"`, "max_tokens: 1024", "PWD=/home/user/project"} {
		if got := Scan(dets, text); len(got) != 0 {
			t.Errorf("false positive on placeholder %q: %+v", text, got)
		}
	}
}

func TestLuhn(t *testing.T) {
	for _, valid := range []string{"4111111111111111", "4111-1111-1111-1111", "5500005555555559", "378282246310005"} {
		if !Luhn(valid) {
			t.Errorf("Luhn(%q) = false, want true", valid)
		}
	}
	for _, invalid := range []string{"4111111111111112", "1234567890123456", "411111", ""} {
		if Luhn(invalid) {
			t.Errorf("Luhn(%q) = true, want false", invalid)
		}
	}
}

func TestVaultRoundTrip(t *testing.T) {
	v := NewVault(time.Hour, 100)
	r := &Redactor{Detectors: Detectors([]string{"email", "credit_card"}), Vault: v}

	text := "Mail jane@example.com about card 4111 1111 1111 1111."
	redacted, values, hits := r.Redact(text)
	if redacted == text {
		t.Fatal("nothing was redacted")
	}
	if strings.Contains(redacted, "jane@example.com") || strings.Contains(redacted, "4111 1111 1111 1111") {
		t.Fatalf("raw values survived: %q", redacted)
	}
	if len(values) != 2 || len(hits) != 2 {
		t.Fatalf("want two tokens and two hits, got %d and %d", len(values), len(hits))
	}

	restored, unknown := Rewrite(redacted, values)
	if restored != text {
		t.Fatalf("round trip failed:\n got %q\nwant %q", restored, text)
	}
	if len(unknown) != 0 {
		t.Fatalf("unknown tokens on a full round trip: %v", unknown)
	}
}

func TestVaultIsStableAcrossRequests(t *testing.T) {
	v := NewVault(time.Hour, 100)
	a := v.TokenFor("EMAIL", "sam@example.com")
	b := v.TokenFor("EMAIL", "sam@example.com")
	if a != b {
		t.Fatalf("same value got two tokens: %s and %s", a, b)
	}
	if c := v.TokenFor("EMAIL", "other@example.com"); c == a {
		t.Fatal("distinct values share a token")
	}
	if !strings.HasPrefix(a, "⟦PII:EMAIL:") {
		t.Fatalf("unexpected token shape %q", a)
	}
}

func TestRewriteLeavesUnknownTokens(t *testing.T) {
	known := map[string]string{"⟦PII:EMAIL:1⟧": "a@example.com"}
	text := "known ⟦PII:EMAIL:1⟧ and unknown ⟦PII:EMAIL:9⟧"
	out, unknown := Rewrite(text, known)
	if out != "known a@example.com and unknown ⟦PII:EMAIL:9⟧" {
		t.Fatalf("got %q", out)
	}
	if len(unknown) != 1 || unknown[0] != "⟦PII:EMAIL:9⟧" {
		t.Fatalf("unknown list = %v", unknown)
	}
}

func TestScanPrefersLongerOverlap(t *testing.T) {
	// The private key block contains a "password=" line; the block must win
	// rather than being split by the inner match.
	text := "-----BEGIN RSA PRIVATE KEY-----\npassword=hunter2\n-----END RSA PRIVATE KEY-----"
	matches := Scan(Detectors([]string{"private_key", "generic_secret"}), text)
	if len(matches) == 0 {
		t.Fatal("no match")
	}
	if matches[0].Rule != "private_key" {
		t.Fatalf("overlap resolved to %q", matches[0].Rule)
	}
	for i := 1; i < len(matches); i++ {
		if matches[i].Start < matches[i-1].End {
			t.Fatalf("overlapping matches returned: %+v", matches)
		}
	}
}
