# Aegis

Aegis is a guardrail proxy that sits between your employees' AI tools and the model providers. Claude Code, pi and any OpenAI- or Anthropic-compatible client change one base URL, and every request then goes through the same pipeline: validate, redact, judge, cache, budget, route, scan the response, ledger. The binary is called `guardrail`.

It exists because coding agents read files. An agent that opens `app.properties` or a board pack sends what it read to the model on the next turn. Aegis tokenizes secrets and PII before they leave, holds confidential text for a human to approve, caps spend per employee, and records every decision without storing the prompt.

One Go binary, CPU only, SQLite. The only outbound calls go to the providers you configure and, when it is enabled, the judge model.

## Quickstart

```bash
go build -o guardrail ./cmd/guardrail

cp config.example.yaml config.yaml
# edit routes, keys and limits, then sign it
./guardrail sign config.yaml

export OPENAI_API_KEY=sk-...
export GUARDRAIL_ADMIN_TOKEN=$(openssl rand -hex 16)
./guardrail serve -config config.yaml -dev
```

Point any OpenAI SDK at `http://localhost:8080/v1`, or an Anthropic client at `http://localhost:8080`. The bearer token is the employee's proxy token, never a provider key:

```bash
curl -s localhost:8080/v1/chat/completions \
  -H 'Authorization: Bearer emp-alice' \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}'
```

The response carries the decision in headers:

```
X-Guardrail-Action:  pass | redact | block | cache_hit
X-Guardrail-Stage:   validate | redact | judge | cache | budget | route | response-scan
X-Guardrail-Judge:   allow; 812ms | escalate; cached | held | approved | unavailable
X-Guardrail-Ticket:  SEC-1A2B3C4D          (held for review)
X-Guardrail-Cache:   HIT
X-Guardrail-Budget:  exceeded | approaching
X-Guardrail-Request-Id, X-Guardrail-Budget-Remaining-Tokens
```

`scripts/demo-traffic.sh` sends the demo mix (secret, board pack, clean, cache hit, injection, budget cap) through a running proxy and checks each status code.

## Coding agents

`deploy/README.md` has the full setup. In short:

- **Claude Code**: `deploy/claude-code/managed-settings.json` is the IT-managed policy. It sets `ANTHROPIC_BASE_URL` to the proxy, gets the employee token from an `apiKeyHelper`, denies reads of secrets files, and disables `--dangerously-skip-permissions`. Users can't override it.
- **pi**: merge `deploy/pi/models.json` into `~/.pi/agent/models.json`.
- Quick test without installing anything:

  ```bash
  ANTHROPIC_BASE_URL=http://localhost:8080 ANTHROPIC_AUTH_TOKEN=emp-alice claude
  ```

Tool results are scanned like any other message, so a secret in a file the agent read is tokenized before the model sees it.

## The judge and the SecOps queue

Regex can't tell a board pack from a weather forecast. Set `judge.enabled: true` and point `judge.base_url` at any OpenAI-compatible endpoint (the company's own model in production, OpenRouter for the demo). When the newest message contains a trigger word (`confidential`, `forecast`, `merger`, `roadmap` and the others in `judge.triggers`), Aegis asks a small judge model whether the text may leave. The judge sees the text after redaction, so it never receives the secrets or PII the detectors found.

- **Allow**: the request continues. A weather forecast trips the trigger and passes.
- **Hacking requests** use the same path. Words such as `hack`, `keylogger`, `phishing` or `bypass` call the judge, which holds requests to write malware, break into accounts, phish or evade security tools (category `malicious cyber`). SecOps can approve an authorized test. Defensive questions, such as how to fix a SQL injection in your own code, pass.
- **Escalate**: the request gets a 403 (a 400 on the Anthropic wire, so Claude Code shows the message) with a ticket (`SEC-…`), the category and the judge's reason. The ticket waits in the SecOps queue.
- SecOps approves or rejects it (`POST /held/{ticket}/approve|reject` with an optional note, or from the portal). An approved text passes on resend without asking the judge again. A rejected text keeps blocking.
- The employee can check their own ticket at `GET /v1/tickets/{ticket}` with their own token. Another employee's token gets 404.
- Judge verdicts are memoized in memory. SecOps decisions are stored in SQLite and survive a restart.
- `judge.fail_closed: true` (the example config's default) refuses triggered requests with a 503 when the judge can't answer. `false` lets them through with an audit note.

## Dashboards

- **Portal** (`web/portal`, React): dashboard, audit log with per-request pipeline traces, approvals queue, a playground that dry-runs any text through the policy (`POST /simulate`) or sends it as an employee, and system health. Every number comes from the admin API; there is no mock data.

  ```bash
  cd web/portal && pnpm install
  AEGIS_ADMIN_TOKEN=$GUARDRAIL_ADMIN_TOKEN pnpm dev    # http://127.0.0.1:3000
  ```

  The Vite dev server adds the admin token on the server side and listens on loopback only.
- **Built-in ledger**: `http://localhost:8081/dashboard#token=<admin token>`, a single page served by the binary.

## Routes

A request picks a route by, in order: the `X-Guardrail-Route` header, a `route/model` prefix (`claude/claude-sonnet-4-5`), a model listed in a route's `model_map`, then the default (`openai`, else `claude`).

OpenAI-shaped clients can talk to Claude: the proxy extracts system turns, builds Anthropic content blocks, and re-encodes the response into OpenAI shape. The reverse works too. Streaming across wire formats is refused with a 400; the SSE path forwards bytes unchanged only when both sides speak the same protocol.

## Admin API

The admin plane listens on `127.0.0.1:8081` and requires `GUARDRAIL_ADMIN_TOKEN`:

```bash
export GUARDRAIL_ADMIN_TOKEN=$(openssl rand -hex 16)
curl -s -H "Authorization: Bearer $GUARDRAIL_ADMIN_TOKEN" localhost:8081/stats
curl -s -H "Authorization: Bearer $GUARDRAIL_ADMIN_TOKEN" 'localhost:8081/ledger?limit=20'
```

Without the token every admin path returns 404, not 401. The port does not advertise that it exists.

`guardrail stats` prints the same aggregates straight from SQLite:

```bash
./guardrail stats -db guardrail.db
```

## What it catches

**Prompt injection and jailbreaks.** Scored rules for "ignore previous instructions", "disregard the above", "system prompt:", "you are now", "repeat everything above", DAN, developer mode, no restrictions, and related phrasings. Zero-width characters and look-alike Cyrillic/Greek letters are normalized before matching. Block threshold is 0.8; scores from 0.5 up are recorded in the audit log and allowed through. `security.monitor: true` records every would-be block without blocking, which is what you want for the first week.

**PII and secrets.** Email, international phone numbers, SSN, credit cards (Luhn-checked), AWS keys, JWTs, PEM private keys, IBAN (checksum), and generic `password=` / `api_key=` / bearer / connection-string values. Matches become `⟦PII:TYPE:N⟧` tokens. The model never sees the original.

**Re-identification.** The proxy keeps a per-request token to value map plus a process-wide LRU memo keyed by `sha256(value)` with a 1 hour TTL, so the same email resolves to the same token across turns and across requests. Non-streaming responses get originals restored. Tokens the map does not know are left as-is and recorded.

**Response scanning.** PII in model output is tokenized (`response.redact_pii`, default on). Credential patterns in output are blocked with a 403 (`response.block_secrets`, default on), which catches a model echoing a key it was fed earlier. Injection patterns in output are flag-only by default.

**Schema and limits.** Roles must be `system`, `user`, `assistant`, or `tool`; `max_tokens` must fit the configured ceiling; bodies over `max_body_bytes` get a 413; temperature must be within `[0, 2]`.

**Exact-prompt cache.** Key is `sha256(normalized prompt + model + temperature)`, normalized as collapsed whitespace and lowercase with PII tokens left in place. The cache stores the tokenized body, never the raw value. Skipped above temperature 0.2, on streaming requests, and when the client sends `Cache-Control: no-cache`. SQLite-backed with an in-memory LRU, 5000 entries, 1 hour TTL.

**Budgets.** Per-key daily USD, per-key daily tokens, per-key hourly tokens, and a global daily USD ceiling. Over the line is a 429 with `X-Guardrail-Budget: exceeded`. At 80 percent of the per-key USD ceiling a short system nudge is prepended when `budget.soft_nudge` is on. Real cost comes from the provider's `usage` fields; estimates (chars/4) fill in for blocked requests and for the budget check before the upstream runs.

**Audit.** One SQLite row per request: timestamp, key, route, model, action, stage, rule hits with scores, latency, input and output tokens, cost, cache hit, tokens and dollars saved. Batched at 100 rows or 1 second.

## Token savings

Four levers, in the order they tend to matter:

1. **Cache hits** cost nothing. Exact repeats in demos, evals, and retry loops are common.
2. **The budget nudge** asks for concision at 80 percent of a ceiling.
3. **PII tokens** usually make prompts shorter as well as safer.
4. **Cache write after rewrite** means a hit still returns the caller's originals while the cache itself is safe to inspect.

Stats reports `tokens_saved`, `usd_saved`, `usd_spent`, and the cache hit rate so the money slide is one request away.

## Honest limits

- **The detectors are deterministic; only the judge is semantic.** Regex and checksums cannot catch a novel injection phrased around the rules, or PII in an unanticipated format. The judge covers confidential prose, but only when a trigger word or a grey-zone security score calls it, and only for the newest message. Text without a trigger is never judged unless `judge.always` is on.
- **The judge is a third party unless you host it.** It receives the newest message after redaction. Point `judge.base_url` at a model inside your own boundary if that text must not leave. A judge model can also be wrong: approval and rejection stay with a human. The optional asynchronous ONNX classifier described in the extended DESIGN.md is not in this build: the config accepts the `ml` block but refuses to start with `ml.enabled: true` rather than pretend to scan.
- **Streaming responses are not re-identified in real time.** Chunks are forwarded byte for byte while the full text accumulates; the response is scanned and parsed after the stream ends, so an output-side block or cache write happens after the client has already seen the bytes. Non-streaming traffic is fully enforced.
- **Streaming across wire formats is refused.** No OpenAI-to-Anthropic SSE translation.
- **Response blocking is opt-in for injection.** False positives on model output are costly, so `block_injection` defaults to false.
- **Cache keys are exact after normalization.** Paraphrases miss. No semantic cache. The key is prompt, model, and temperature as specified, so `max_tokens` is not part of it: a cached answer can be shorter than a later request asks for.
- **The proxy does not compress prompts or reroute to a cheaper model.** DESIGN.md lists both as opt-in levers; neither is implemented here. Saved tokens come from cache hits and redaction, and the audit reflects only those.
- **Config signing is fail-closed, not tamper-evident against the operator.** The proxy refuses an unsigned or modified config when `security.tamper` is true, but the operator can flip the flag and re-sign. That is the honest boundary of a local proxy.
- **The admin token comes from `GUARDRAIL_ADMIN_TOKEN`.** If the variable is unset, the admin plane returns 404 for every request.
- **Any bearer token is accepted as an employee identity.** There is no key registry yet, so budgets and tickets key on whatever token the client sends. Put the proxy behind your SSO or issue tokens from the `apiKeyHelper`.
- **One host, one config, one SQLite writer.** No multi-tenant shape, no distributed cache, no HA.
- **Config is read at startup only.** Change, sign, restart.

## Architecture

```
cmd/guardrail/        serve | sign | stats
internal/judge/       LLM judge client and verdict cache
internal/config/      YAML load, validation, ed25519 sign and verify
internal/pipeline/    stage orchestration, held-ticket store, Request/Decision/Result shapes
internal/security/    injection, jailbreak, schema, rate limiting
internal/dlp/         detectors, token vault, rewrite
internal/cache/       SQLite-backed LRU response cache
internal/budget/      estimates, pricing, ledger, ceilings
internal/route/       provider adapters and retries
internal/wire/        OpenAI <-> internal <-> Anthropic mapping
internal/audit/       batched rows and aggregates
internal/server/      data plane on :8080, admin plane on 127.0.0.1:8081
internal/store/       the single SQLite handle and schema
web/portal/           React SecOps portal (Vite dev server, admin token stays server-side)
deploy/               Claude Code managed settings and pi config
scripts/              demo-traffic.sh, bench-judge.sh
```

Build and test with `CGO_ENABLED=0 go build ./... && CGO_ENABLED=0 go test ./...`. The only dependency beyond the standard library is `modernc.org/sqlite` (pure Go) plus `gopkg.in/yaml.v3` for config parsing.
