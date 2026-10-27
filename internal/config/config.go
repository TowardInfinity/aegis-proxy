// Package config loads the signed YAML configuration, validates it at the
// boundary, and owns the ed25519 sign/verify machinery.
package config

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

// Config mirrors the YAML document in config.example.yaml. Durations are
// parsed from strings such as "1h" so the file stays readable.
type Config struct {
	Listen string    `yaml:"listen"`
	TLS    TLSConfig `yaml:"tls"`

	Routes map[string]RouteConfig `yaml:"routes"`

	Security SecurityConfig `yaml:"security"`
	PII      PIIConfig      `yaml:"pii"`
	Response ResponseConfig `yaml:"response"`
	Cache    CacheConfig    `yaml:"cache"`
	Budget   BudgetConfig   `yaml:"budget"`
	Storage  StorageConfig  `yaml:"storage"`
	// ML is accepted so configs written against the extended design parse, but
	// this build has no ONNX runtime and refuses to start with it enabled.
	ML MLConfig `yaml:"ml"`

	// SourcePath and SourceHash are filled in by Load, never by YAML.
	SourcePath string `yaml:"-"`
	SourceHash string `yaml:"-"`
}

type TLSConfig struct {
	CertFile string `yaml:"cert_file"`
	KeyFile  string `yaml:"key_file"`
}

type RouteConfig struct {
	Wire     string            `yaml:"wire"`
	BaseURL  string            `yaml:"base_url"`
	AuthEnv  string            `yaml:"auth_env"`
	ModelMap map[string]string `yaml:"model_map"`
	Timeout  Duration          `yaml:"timeout"`
}

type SecurityConfig struct {
	Tamper          bool   `yaml:"tamper"`
	TamperKeyFile   string `yaml:"tamper_key_file"`
	MaxBodyBytes    int64  `yaml:"max_body_bytes"`
	MaxTokens       int    `yaml:"max_tokens"`
	RateLimitPerMin int    `yaml:"rate_limit_per_min"`
	RateLimitPerIP  int    `yaml:"rate_limit_per_min_ip"`
	// Thresholds tune the block score per detector family; zero means the
	// package default from security.DefaultThresholds.
	Thresholds map[string]float64 `yaml:"thresholds"`
	// Monitor runs every detector and logs decisions without blocking.
	Monitor bool `yaml:"monitor"`
}

type PIIConfig struct {
	Redact    bool     `yaml:"redact"`
	Detectors []string `yaml:"detectors"`
	VaultTTL  Duration `yaml:"vault_ttl"`
	VaultSize int      `yaml:"vault_size"`
}

type ResponseConfig struct {
	RedactPII      bool `yaml:"redact_pii"`
	BlockSecrets   bool `yaml:"block_secrets"`
	BlockInjection bool `yaml:"block_injection"`
}

type CacheConfig struct {
	Enabled bool     `yaml:"enabled"`
	TTL     Duration `yaml:"ttl"`
	Size    int      `yaml:"size"`
}

type BudgetConfig struct {
	SoftNudge      bool                     `yaml:"soft_nudge"`
	DailyUSD       float64                  `yaml:"daily_usd"`
	DailyTokens    int                      `yaml:"daily_tokens"`
	HourlyTokens   int                      `yaml:"hourly_tokens"`
	PerKeyDailyUSD float64                  `yaml:"per_key_daily_usd"`
	PerKeyDailyTok int                      `yaml:"per_key_daily_tokens"`
	Pricing        map[string]PricingConfig `yaml:"pricing"`
}

type PricingConfig struct {
	Input  float64 `yaml:"input"`
	Output float64 `yaml:"output"`
}

type StorageConfig struct {
	SQLitePath string `yaml:"sqlite_path"`
}

// MLConfig is the asynchronous classifier contract. The regex pipeline is the
// only detector set in this binary, so enabling this is an error, not a
// silently ignored setting.
type MLConfig struct {
	Enabled   bool    `yaml:"enabled"`
	ModelPath string  `yaml:"model_path"`
	Threshold float64 `yaml:"threshold"`
	Mode      string  `yaml:"mode"`
	MaxTokens int     `yaml:"max_tokens"`
	Window    string  `yaml:"window"`
	TimeoutMS int     `yaml:"timeout_ms"`
}

// Load reads and validates the config at path. Signature handling is separate
// so the caller can decide whether to fail closed.
func Load(path string) (*Config, []byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read config %s: %w", path, err)
	}
	var c Config
	dec := yaml.NewDecoder(bytes.NewReader(raw))
	dec.KnownFields(true)
	if err := dec.Decode(&c); err != nil {
		return nil, raw, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := c.Validate(); err != nil {
		return nil, raw, fmt.Errorf("invalid config %s: %w", path, err)
	}
	sum := sha256.Sum256(raw)
	c.SourcePath = path
	c.SourceHash = hex.EncodeToString(sum[:])
	return &c, raw, nil
}

// Validate is the boundary guard. Everything downstream trusts the config.
func (c *Config) Validate() error {
	if c.Listen == "" {
		return errors.New("listen is required")
	}
	if len(c.Routes) == 0 {
		return errors.New("at least one route is required")
	}
	for name, r := range c.Routes {
		switch r.Wire {
		case "openai", "anthropic":
		case "":
			return fmt.Errorf("route %q: wire is required", name)
		default:
			return fmt.Errorf("route %q: wire must be openai or anthropic, got %q", name, r.Wire)
		}
		if r.BaseURL == "" {
			return fmt.Errorf("route %q: base_url is required", name)
		}
		if r.Timeout <= 0 {
			c.Routes[name] = withTimeout(r, Duration(60*time.Second))
		}
	}
	if c.Security.Tamper && c.Security.TamperKeyFile == "" {
		return errors.New("security.tamper_key_file is required when security.tamper is true")
	}
	if c.Security.MaxBodyBytes <= 0 {
		c.Security.MaxBodyBytes = 1 << 20
	}
	if c.Security.MaxTokens <= 0 {
		c.Security.MaxTokens = 8192
	}
	if c.Storage.SQLitePath == "" {
		return errors.New("storage.sqlite_path is required")
	}
	if c.Cache.Size <= 0 {
		c.Cache.Size = 5000
	}
	if c.Cache.TTL <= 0 {
		c.Cache.TTL = Duration(time.Hour)
	}
	if c.PII.VaultSize <= 0 {
		c.PII.VaultSize = 10000
	}
	if c.PII.VaultTTL <= 0 {
		c.PII.VaultTTL = Duration(time.Hour)
	}
	for _, d := range c.PII.Detectors {
		if !validDetector(d) {
			return fmt.Errorf("pii.detectors: unknown detector %q", d)
		}
	}
	if c.ML.Enabled {
		return errors.New("ml.enabled requires the ONNX classifier, which this build does not include; run with ml.enabled: false")
	}
	switch c.ML.Mode {
	case "", "shadow", "flag", "block":
	default:
		return fmt.Errorf("ml.mode must be shadow, flag, or block, got %q", c.ML.Mode)
	}
	switch c.ML.Window {
	case "", "tail", "head", "both":
	default:
		return fmt.Errorf("ml.window must be tail, head, or both, got %q", c.ML.Window)
	}
	return nil
}

func withTimeout(r RouteConfig, d Duration) RouteConfig {
	r.Timeout = d
	return r
}

// Duration is a time.Duration that YAML reads as "1h" rather than as an
// integer count of nanoseconds, which is what yaml.v3 does by default.
type Duration time.Duration

// UnmarshalYAML accepts both "90s" strings and bare integers.
func (d *Duration) UnmarshalYAML(value *yaml.Node) error {
	if value.Tag == "!!int" {
		var n int64
		if err := value.Decode(&n); err != nil {
			return err
		}
		*d = Duration(time.Duration(n))
		return nil
	}
	var s string
	if err := value.Decode(&s); err != nil {
		return err
	}
	if s == "" {
		*d = 0
		return nil
	}
	parsed, err := time.ParseDuration(s)
	if err != nil {
		return fmt.Errorf("duration %q: %w", s, err)
	}
	*d = Duration(parsed)
	return nil
}

// Std returns the standard library duration.
func (d Duration) Std() time.Duration { return time.Duration(d) }

// String renders the duration for logs.
func (d Duration) String() string { return time.Duration(d).String() }

// RouteFor returns the named route and its resolved timeout.
func (c *Config) RouteFor(name string) (RouteConfig, bool) {
	r, ok := c.Routes[name]
	return r, ok
}

// SignPath returns the conventional signature path for a config file.
func SignPath(configPath string) string { return configPath + ".sig" }

// Sign signs raw config bytes and writes path.sig. It creates the keypair when
// privPath is missing.
func Sign(privPath, configPath string) (pubPath string, err error) {
	priv, err := LoadOrCreateKey(privPath)
	if err != nil {
		return "", err
	}
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return "", fmt.Errorf("read config: %w", err)
	}
	sig := ed25519.Sign(priv, raw)
	if err := os.WriteFile(SignPath(configPath), sig, 0o644); err != nil {
		return "", fmt.Errorf("write signature: %w", err)
	}
	pubPath = pubKeyPath(privPath)
	return pubPath, WritePublicKey(pubPath, priv.Public().(ed25519.PublicKey))
}

func pubKeyPath(privPath string) string {
	ext := filepath.Ext(privPath)
	return privPath[:len(privPath)-len(ext)] + ".pub"
}

// PublicKeyFile derives guardrail_ed25519.priv -> guardrail_ed25519.pub.
func PublicKeyFile(privPath string) string { return pubKeyPath(privPath) }

// LoadOrCreateKey loads an ed25519 private key in PKCS8 PEM, generating it on
// first call.
func LoadOrCreateKey(path string) (ed25519.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err == nil {
		return parsePrivate(raw)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("read private key: %w", err)
	}
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	if err := os.WriteFile(path, pemBytes, 0o600); err != nil {
		return nil, fmt.Errorf("write private key: %w", err)
	}
	return priv, nil
}

func parsePrivate(raw []byte) (ed25519.PrivateKey, error) {
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("private key is not PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}
	priv, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not ed25519")
	}
	return priv, nil
}

// WritePublicKey writes an ed25519 public key as PEM.
func WritePublicKey(path string, pub ed25519.PublicKey) error {
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return err
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	return os.WriteFile(path, pemBytes, 0o644)
}

// LoadPublicKey reads a PEM ed25519 public key.
func LoadPublicKey(path string) (ed25519.PublicKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read public key: %w", err)
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("public key is not PEM")
	}
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}
	pub, ok := key.(ed25519.PublicKey)
	if !ok {
		return nil, errors.New("public key is not ed25519")
	}
	return pub, nil
}

// Verify checks raw config bytes against path.sig under pub. It returns a
// non-nil error naming the failure mode so the startup message is actionable.
func Verify(pub ed25519.PublicKey, configPath string, raw []byte) error {
	sigPath := SignPath(configPath)
	sig, err := os.ReadFile(sigPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("config is unsigned: %s is missing", sigPath)
		}
		return fmt.Errorf("read signature: %w", err)
	}
	if len(sig) != ed25519.SignatureSize {
		return fmt.Errorf("signature %s has wrong length", sigPath)
	}
	if !ed25519.Verify(pub, raw, sig) {
		return errors.New("config signature does not verify: config.yaml was modified after signing")
	}
	return nil
}

// CheckAccept returns an error when the config must not load under its own
// tamper policy.
func CheckAccept(c *Config, raw []byte) error {
	if !c.Security.Tamper {
		return nil
	}
	pub, err := LoadPublicKey(c.Security.TamperKeyFile)
	if err != nil {
		return fmt.Errorf("security.tamper is true but the public key is unusable: %w", err)
	}
	return Verify(pub, c.SourcePath, raw)
}

// detectors is the closed set of DLP detector names a config may enable.
var detectors = map[string]bool{
	"email": true, "phone": true, "ssn": true, "credit_card": true,
	"aws_key": true, "jwt": true, "private_key": true, "generic_secret": true,
	"iban": true,
}

func validDetector(name string) bool { return detectors[name] }
