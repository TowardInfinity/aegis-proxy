# nexgen-guardrails

A self-contained LLM security and cost guardrail. It runs as a local HTTP proxy between your AI app and any LLM provider. It inspects every request and response, redacts sensitive data, detects prompt injection, blocks jailbreak attempts, enforces budgets, and cuts token spend — all on CPU, with zero GPU, zero cloud dependencies, and zero external API calls.

The name is a working title; change it freely.

## Why a proxy

Three failure modes of direct LLM API use:

1. **Leakage.** Developers paste logs, credentials, PII, and internal docs into prompts. Nobody audits that until it is in a third-party's logs.
2. **Cost.** No per-team, per-user, per-key budget. A runaway loop or an enthusiastic demo burns the account. Long prompts go uncompressed; identical questions pay twice.
3. **Injection.** Untrusted text from documents, emails, or web pages flows into prompts and steers the model.

A proxy fixes all three at one choke point. The app changes one base URL. That is the whole integration.

## Design constraints

- **CPU only.** No GPU, no model inference for detection. Rules, regexes, entropy, and hashing classifiers run in microseconds per request. Target under 5 ms added latency for a 10 KB prompt.
- **Self-contained.** One binary (Go), one config file. No database, no message queue, no external service. SQLite for audit and cache, created on first run.
- **Tamper-proof config.** The operator signs the config; the proxy refuses to run unsigned or tampered config. see config section.
- **Drop-in.** Speaks the OpenAI wire protocol for requests and responses (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`). Apps already using the OpenAI SDK switch the base URL and nothing else. Anthropic and AIPro adapters map to the same pipeline and emit OpenAI-shaped responses.

## What it does

Every request flows through a pipeline. Each stage can pass, redact, block, or short-circuit.

```
app ──> ingress ──> [validate] ──> [redact] ──> [cache] ──> [budget] ──> [route] ──> upstream
  ^                                                                                 │
  └── [rewrite] <── [cache] <── [scan output] <── [stream decode] <─────────────────┘
```

### Stage 1: validate (request security)

Deterministic detectors over the normalized request text:

- **Prompt injection.** Pattern families: instruction override ("ignore previous instructions", "disregard the above", "system prompt:"), role confusion ("you are now", "act as"), obfuscation (unicode homoglyphs, zero-width chars, base64 blobs that decode to instruction-like text), and delimited-payload extraction ("everything above is" / "repeat your system prompt"). Each hit scores; a threshold blocks, a near-threshold flags into the audit log.
- **Jailbreak shapes.** DAN/pretext templates, fake "developer mode", "no restrictions" phrasing.
- **Schema check.** Body must parse; roles must be one of system/user/assistant/tool; temperature within range; max_tokens bounded by provider limits and by config ceiling.
- **Size limit.** Request body above the configured ceiling gets 413 before touching the upstream.
- **Rate limit.** Token bucket per API key and per client IP.

### Stage 2: redact (data loss prevention)

Detector classes, each a compiled regex or detector plugin over the request text and the cached system prompt:

- Credentials: AWS keys (`AKIA...`), GCP keys, private SSH key bodies, generic `Bearer`/`Authorization` headers, `password=`, connection strings, `.env` variable dumps, JWTs.
- PII: emails, phone numbers (with country-format variants), national IDs (SSN, Aadhaar, PAN, IBAN), credit card numbers (Luhn validated), IP addresses (optional), dates of birth.
- Secrets in code: `-----BEGIN ... PRIVATE KEY-----` blocks, `client_secret=`, `api_key=`.

Each match is replaced with a **reversible token**: `⟦PII:EMAIL:1⟧`, `⟦PII:SSN:2⟧`. The vault for this request lives in memory. The replacement map keys to the original values. After the model responds, **stage 6 rewrite** puts the originals back where the tokens appear in the response, so the app sees the model's answer about "user email ⟦PII:EMAIL:1⟧" with the real email substituted back.

If the response contains a token the vault does not know (model hallucinated one), leave it as-is and flag in audit. Never fail the response for this.

Vault lifetime: per-request, dropped after rewrite. Optionally, a TTL cache keyed by `hash(value)` so the same email redacts to the same token across requests — this lets multi-turn conversations keep referring to the same token. Default on, 1h TTL, LRU cap 10k entries. Values never hit disk; only salted hashes do.

### Stage 3: cache (semantic dedup)

Exact-duplicate detection first: SHA-256 of normalized (whitespace-collapsed, lowercased, with redacted tokens in place) prompt + model + temperature > 0.2 disables caching. On a hit, return the cached response with `X-Guardrail-Cache: HIT` and skip the upstream call entirely — this is the biggest cost saver for repeated prompts in demos, retries, and eval loops.

TTL default 1h, LRU cap 5000 entries, max cached response size 256 KB. Persisted in SQLite so a proxy restart keeps the cache. `no-cache` honored: requests with `Cache-Control: no-cache` or config `bypass_cache` skip this stage.

### Stage 4: budget (cost control)

A token-estimator (chars/4 heuristic per provider, or provider-reported usage when the response arrives) and a per-key ledger:

- Per-key daily spend ceiling in dollars and in tokens. Both configurable. On exceed, 429 with `X-Guardrail-Budget: exceeded` until the day rolls over or the operator raises the limit in signed config.
- Per-key hourly rate: max requests per hour, max total tokens per hour.
- Global daily ceiling across all keys, as a fuse.
- **Soft mode**: at 80% of a ceiling, the proxy still passes requests but injects a system message "You are approaching your budget; be concise." This measurably shortens responses. Config: `budget.soft_nudge: true`.

Ledger lives in SQLite. Pricing table in config: model name -> {input $/1M tokens, output $/1M tokens}. The operator edits pricing in signed config; the proxy ships with a default table for common models.

**Response-side accounting:** when the upstream responds, the proxy reads `usage` from the response (all three providers report it) and writes the real cost to the ledger. Estimation fills the gap for blocked requests only.

### Stage 5: route (provider mapping)

Config-driven table. Routes:

- `claude` -> Anthropic Messages API (URL rewrite, header mapping, body mapping from OpenAI shape to Anthropic shape and back on response).
- `openai` -> OpenAI passthrough.
- `aipro` -> Samsung SDS AIPro. Adapter normalizes to the internal pipeline shape; the operator supplies base URL and auth header format in config.
- `custom` -> any OpenAI-compatible endpoint (vLLM, LiteLLM, Ollama, another guardrails proxy). Base URL in config.

Each route declares: upstream base URL, auth env var name (e.g. `ANTHROPIC_API_KEY`), wire format (`openai` or `anthropic`), model name mapping table, timeout, retry policy (idempotent requests only, max 2 retries with jittered backoff), and token budget class.

Model routing by cost: optional `route_cheapest` — if a request's model is "expensive class" and the estimated prompt is short (under N tokens) and the task looks non-complex (heuristics: no tool calls, no long context), rewrite to the cheap model in the same family. Config gives the mapping table; this is opt-in per key.

### Stage 6: response pipeline (in order)

1. **Stream decode.** If upstream is streaming (SSE), the proxy transparently re-streams to the client. Scan each complete message on the fly. Accumulate the full text in memory for the stages below.
2. **Scan output.** Same detector families as stage 2, applied to model output. Catches the model echoing PII it was fed in an earlier turn, or leaking system prompt contents. Config: `response.redact_pii` (default on), `response.block_injection` (default off, flag only — false positives here are costly), `response.block_secrets` (default on, block when the response contains a credential pattern).
3. **Rewrite (re-identification).** Put originals back for known tokens. Leave unknown tokens as-is.
4. **Cache write.** Store response for the request's cache key.
5. **Ledger write.** Real cost from `usage`.
6. **Audit log.** Structured line per request: timestamp, key, route, model, decision (pass/redact/block/cache), rule hits with scores, latency ms, token counts, cost. SQLite table, queryable via a small CLI subcommand.

## Config

One YAML file, `config.yaml`. Ships with a fully commented example. Loaded at startup; if config file is missing, the proxy refuses to start (fail-closed) rather than running with defaults.

```yaml
listen: ":8080"
tls:
  cert_file: ""
  key_file: ""

routes:
  claude:
    wire: anthropic
    base_url: "https://api.anthropic.com"
    auth_env: ANTHROPIC_API_KEY
    model_map:
      "claude-sonnet-4-5": "claude-sonnet-4-5"
  openai:
    wire: openai
    base_url: "https://api.openai.com"
    auth_env: OPENAI_API_KEY
  aipro:
    wire: openai
    base_url: "https://aipro.example.com/v1"
    auth_env: AIPRO_API_KEY
  ollama:
    wire: openai
    base_url: "http://localhost:11434/v1"
    auth_env: ""

security:
  tamper: true            # require signed config; refuse unsigned
  tamper_key_file: "guardrail_ed25519.pub"  # PEM ed25519 public key
  max_body_bytes: 1048576
  max_tokens: 8192
  rate_limit_per_min: 60          # per key
  rate_limit_per_min_ip: 120      # per client IP

pii:
  redact: true
  detectors: [email, phone, ssn, credit_card, aws_key, jwt, private_key, generic_secret, iban]
  vault_ttl: 1h
  vault_size: 10000

response:
  redact_pii: true
  block_secrets: true
  block_injection: false

cache:
  enabled: true
  ttl: 1h
  size: 5000

budget:
  soft_nudge: true
  daily_usd: 50.0
  daily_tokens: 2000000
  hourly_tokens: 400000
  per_key_daily_usd: 10.0
  per_key_daily_tokens: 400000
  pricing:
    "claude-sonnet-4-5": {input: 3.0, output: 15.0}
    "gpt-4o": {input: 2.5, output: 10.0}
    "gpt-4o-mini": {input: 0.15, output: 0.6}

storage:
  sqlite_path: "guardrail.db"
```

### Tamper-proofing

The operator signs `config.yaml` with an ed25519 private key once, offline. The proxy embeds or references the matching public key. At startup:

- Config file must be present and parseable.
- `config.yaml.sig` must exist and verify against `config.yaml` bytes under the embedded public key.
- Any mismatch: refuse to start with a clear message. Fail-closed.
- `tamper: false` in the config disables this for local development; the config still checksums itself against a `.sig` if present.

A small CLI `guardrail sign config.yaml` generates a keypair if none exists and writes the signature. The private key never lives on the proxy host. This is the honest limit of "tamper-proof" for a local proxy: the operator can still run `tamper: false` and re-sign, so the guarantee is "the proxy refuses to run a config that was not signed by the operator's key," not "the operator cannot change their mind." The audit log records every config load and its hash, so the trail is visible.

**Runtime hardening** (defense in depth): the proxy's admin endpoints (stats, ledger, cache flush) are bound to a separate port (default `127.0.0.1:8081`) and require a bearer token generated at startup, printed to stderr once. Without it, the admin port returns 404. The data plane never accepts config changes.

## Token savings

Four mechanisms, in order of impact:

1. **Cache hits.** Repeated prompts cost zero. Demo-heavy and eval-heavy workloads see 30–70% hit rates.
2. **Prompt compression.** Before send: strip redundant whitespace runs, drop repeated boilerplate the system prompt already covers (configurable list of patterns like repeated instruction blocks), collapse duplicated assistant turns. Target 10–30% token reduction on typical prompts. Must be opt-in per key (default off for safety) because it changes what the model sees.
3. **Budget nudge.** The "be concise" system message at 80% budget. Measured effect on response length.
4. **Cheap-model routing.** Opt-in per key. Short, tool-less prompts go to the cheap model in the same family.

We report savings per request in the audit log (input tokens before vs after compression, cache hit = 100% saved) and aggregate in the stats endpoint. This is the demo's money slide.

## Wire protocol details

**OpenAI-compatible path** (`/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`):
- Read JSON body. Normalize to internal `Request` shape.
- Run pipeline stages 1–4. If any stage blocks, return an OpenAI-shaped error JSON with the right HTTP status, plus `X-Guardrail-Action: <stage>` header.
- Pass through: replace the client's Authorization with the configured upstream auth. Forward to the upstream, mapping the wire format if needed.
- Stream or buffer the response. Run stages 6.1–6.6. Return to the client.

**Anthropic path** (`/v1/messages`):
- Same pipeline. Request in Anthropic shape, response in Anthropic shape. The internal pipeline shape is Anthropic-shaped internally, so Claude traffic is nearly passthrough.

**Embeddings** (`/v1/embeddings`): validate + redact + cache + budget. Response is small; no rewrite needed. Cache key includes the model.

**`/v1/models`**: list from config, no upstream call.

## ML classification layer (researched, added post-spike)

A research spike on this machine (Go 1.27.3, Windows 11 x64) measured embedding a small ONNX classifier directly in the Go binary. Findings that shaped the design:

- **ONNX Runtime in Go is proven feasible.** A Go binary embedding `onnxruntime.dll` (17.25 MB) plus a 96 MB int8 model built and ran: 118 MB single exe, ~178 MB RAM, ~20 ms on short prompts. The DLL is extracted to a SHA-256-checked temp dir at first run; the user-visible artifact is still one exe.
- **ML can never live in the synchronous request path.** At 512 tokens the measured inference cost was ~0.5 s, against our 5 ms budget. So ML runs asynchronously and never blocks the handler.
- **Model choice: `patronus-studio/wolf-defender-prompt-injection-small`** (141M params, mmBERT-small, 96 MB int8/int4, Apache-2.0). In the spike it caught a classic DAN jailbreak at P=0.99 that Meta's Prompt Guard 2 22M missed entirely (P=0.005), and ran 5x faster at 512 tokens. Prompt Guard 2 is gated + Llama-licensed anyway.
- **Truncation strategy matters more than model choice.** Naive head truncation to 512 tokens scored a buried injection at P=0.000 (total miss); a tail-preserving window on the same text scored P=0.981. The proxy must window, never truncate.
- **Laya is rejected**: 1.2-1.6 GB weights, 300-600 ms per prompt, recall 0.72 / FPR 0.21 on its own authors' guard set, Python sidecar for the easy path. Its useful contribution is the `presets.Guard()` question wording, copied into our detector coverage checklist.
- **PII detection stays regex**: Presidio's own numbers show regex at 0.90-1.00 recall on the structured types we handle (email, SSN, cards, keys), while PII NER models degrade badly on out-of-distribution text and cost 250 ms - 1 s plus ~800 MB RAM.
- **"Jev" is a closed commercial API** (TypeSafe, `$42/B tokens`), not an open model; open clones are sidecar processes, not Go libraries.

Design contract, per the spike's recommendation:

```yaml
ml:
  enabled: false            # default OFF; the binary must pass every test with it off
  model_path: ""            # optional; falls back to the embedded model
  threshold: 0.90
  mode: shadow              # shadow | flag | block
  max_tokens: 512
  window: tail              # tail | head | both
  timeout_ms: 1500
```

**Regex decides; the model advises; nothing blocks on the model's latency.** After the security stage computes family scores, if `ml.enabled` and `mode != block`, the text goes to a bounded worker pool (2 workers, queue 64, drop-on-full with a counter). The HTTP handler never waits.

- `shadow`: score every request, write `ml_score` into the audit row. Demo mode: regex and ML side by side on the same prompt, ML catches what regex missed.
- `flag`: if a regex family sits at 0.5-0.8 (below block) and ML scores > 0.9, promote the audit decision to `flag`.
- `block`: only on `X-Guardrail-ML: strict` header or explicit config opt-in; then and only then does the handler wait, with a 1.5 s timeout falling back to the regex verdict.

Fail-open on model error (log once, continue regex-only), fail-closed on policy error. If the DLL or model fails to load, the proxy runs regex-only and passes every test.

## Non-goals

- No GPU inference, no local model, no fine-tuning.
- No semantic/ML-based detection (embedding similarity, transformer classifiers). A CPU-only detector set is a hackathon demo of the deterministic floor; note the gap honestly in the README.
- No multi-tenant SaaS shape. This is a single-host proxy, one operator, one config.
- No UI in the core deliverable. Stats endpoint + CLI query suffices for the demo. A dashboard is a stretch goal.

## Architecture

```
cmd/guardrail/          main: serve | sign | admin | stats
internal/
  config/               load, validate, sign, verify (ed25519)
  pipeline/             stage orchestrator: Request -> Decision -> Response
  security/             validate stage: injection, jailbreak, schema, rate limit
  dlp/                  redact stage: detectors, vault, rewrite
  cache/                response cache (SQLite-backed LRU)
  budget/               token estimate, ledger, pricing, enforcement
  route/                provider adapters, wire format mapping
  wire/                 openai <-> internal <-> anthropic mapping
  audit/                structured log to SQLite
cmd/guardrail/serve     HTTP servers: :8080 data plane, :8081 admin
```

Go 1.22+. Single binary. SQLite via `modernc.org/sqlite` (pure Go, no cgo, so cross-compile is trivial and the CPU-only/no-GPU claim is clean).

## Risk register

- **False positives block real traffic.** Every detector is a pattern with a threshold, not a boolean. A "score" above the block threshold blocks; a "score" near it flags to audit only. Config can tune per-detector threshold. `monitor` mode: run all detectors, log decisions, never block — for the first week of deployment.
- **Latency.** Regex scans of a 10 KB prompt are microseconds. Worst case, the cache write and the ledger write add an SQLite transaction each. Batch those writes (flush every 100 entries or 1 s) to keep p99 under 5 ms.
- **PII redaction breaks functionality.** The vault restores tokens in responses, so questions about the redacted value still work. Edge case: the model needs the actual value to compute (e.g. "what is this SSN's check digit"). Config `pii.redact` can turn off per key.
- **Injection detection is regex-based.** Sophisticated injections evade. Honest README: this raises the bar, not airtight. Layered with output-side secret blocking so the worst case is a caught leak, not a prevented one.
- **SQLite write contention.** Single-writer pattern; WAL mode; batched writes keep it fast.
- **Streaming re-identification.** The model's tokens stream to the client; a vault token might not be fully assembled until the stream ends. Strategy: stream through unmodified (client sees tokens immediately); do re-identification only on the buffered copy for the cache and audit log. Document the trade-off: streaming responses are not re-identified in real time; non-streaming ones are. This is the honest behavior for a hackathon build; a production version would hold back a small token window for suffix-matching tokens.
```
