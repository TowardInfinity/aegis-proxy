package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testConfig = `listen: ":0"
routes:
  openai:
    wire: openai
    base_url: "http://127.0.0.1:9"
    timeout: 5s
security:
  tamper: true
  tamper_key_file: "guardrail_ed25519.pub"
pii:
  detectors: [email, credit_card]
  vault_ttl: 45m
cache:
  ttl: 1h
storage:
  sqlite_path: "test.db"
`

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSignThenAccept(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	path := writeConfig(t, testConfig)
	key := filepath.Join(dir, "guardrail_ed25519.priv")

	if _, err := Sign(key, path); err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if _, err := os.Stat(path + ".sig"); err != nil {
		t.Fatalf("signature file missing: %v", err)
	}
	cfg, raw, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if err := CheckAccept(cfg, raw); err != nil {
		t.Fatalf("CheckAccept on signed config: %v", err)
	}
}

func TestTamperedConfigIsRefused(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	path := writeConfig(t, testConfig)
	if _, err := Sign(filepath.Join(dir, "guardrail_ed25519.priv"), path); err != nil {
		t.Fatalf("Sign: %v", err)
	}

	// Flip one byte of a value: same length, still parses, different signature.
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw = []byte(strings.Replace(string(raw), `listen: ":0"`, `listen: ":1"`, 1))
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}

	cfg, tampered, err := Load(path)
	if err != nil {
		t.Fatalf("Load should still parse, got %v", err)
	}
	err = CheckAccept(cfg, tampered)
	if err == nil {
		t.Fatal("tampered config was accepted")
	}
	if !strings.Contains(err.Error(), "does not verify") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMissingSignatureIsRefused(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	path := writeConfig(t, testConfig)
	if _, err := Sign(filepath.Join(dir, "guardrail_ed25519.priv"), path); err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if err := os.Remove(path + ".sig"); err != nil {
		t.Fatal(err)
	}
	cfg, raw, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := CheckAccept(cfg, raw); err == nil || !strings.Contains(err.Error(), "unsigned") {
		t.Fatalf("want unsigned error, got %v", err)
	}
}

func TestTamperOffRunsUnsigned(t *testing.T) {
	path := writeConfig(t, strings.Replace(testConfig, "tamper: true", "tamper: false", 1))
	cfg, raw, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := CheckAccept(cfg, raw); err != nil {
		t.Fatalf("tamper off should accept unsigned config: %v", err)
	}
}

func TestDurationsParseFromStrings(t *testing.T) {
	path := writeConfig(t, strings.Replace(testConfig, "tamper: true", "tamper: false", 1))
	cfg, _, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.Cache.TTL.Std(); got != time.Hour {
		t.Fatalf("cache.ttl = %v, want 1h", got)
	}
	if got := cfg.PII.VaultTTL.Std(); got != 45*time.Minute {
		t.Fatalf("vault_ttl = %v, want 45m", got)
	}
	if got := cfg.Routes["openai"].Timeout.Std(); got != 5*time.Second {
		t.Fatalf("route timeout = %v, want 5s", got)
	}
}

func TestValidateRejectsUnknownWire(t *testing.T) {
	body := strings.Replace(testConfig, "wire: openai", "wire: grpc", 1)
	path := writeConfig(t, strings.Replace(body, "tamper: true", "tamper: false", 1))
	if _, _, err := Load(path); err == nil {
		t.Fatal("unknown wire was accepted")
	}
}

func TestMLConfigDefaultsOff(t *testing.T) {
	body := strings.Replace(testConfig, "tamper: true", "tamper: false", 1) + `
ml:
  enabled: false
  mode: shadow
  window: tail
  threshold: 0.9
`
	path := writeConfig(t, body)
	cfg, _, err := Load(path)
	if err != nil {
		t.Fatalf("disabled ml block rejected: %v", err)
	}
	if cfg.ML.Enabled || cfg.ML.Mode != "shadow" {
		t.Fatalf("ml config = %+v", cfg.ML)
	}
}

func TestMLEnabledIsRefused(t *testing.T) {
	body := strings.Replace(testConfig, "tamper: true", "tamper: false", 1) + "\nml:\n  enabled: true\n"
	path := writeConfig(t, body)
	if _, _, err := Load(path); err == nil || !strings.Contains(err.Error(), "ONNX") {
		t.Fatalf("ml.enabled should fail loudly, got %v", err)
	}
}

func TestMLBadModeRejected(t *testing.T) {
	body := strings.Replace(testConfig, "tamper: true", "tamper: false", 1) + "\nml:\n  enabled: false\n  mode: aggressive\n"
	path := writeConfig(t, body)
	if _, _, err := Load(path); err == nil {
		t.Fatal("unknown ml.mode accepted")
	}
}
