# Pointing AI tools at the proxy

Every tool below speaks either the Anthropic Messages API or the OpenAI chat
completions API, so each one only needs a base URL change. Replace
`https://aegis.corp.example` with your proxy's address (`http://localhost:8080`
on a laptop).

The proxy holds the real provider keys (see `config.example.yaml`).
Employees get a per-person token, which the proxy uses for budgets and the
audit ledger. They never see a provider key.

## Claude Code

`claude-code/managed-settings.json` is the IT-managed policy file. Settings in
it override user and project settings, and users can't change them. Install it at:

| OS | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

What it enforces:

- `ANTHROPIC_BASE_URL`: all model traffic goes through the proxy.
- `apiKeyHelper`: a script that prints the employee's proxy token, for example
  from the keychain or SSO. Employees never handle a provider key.
- `permissions.deny`: the agent can't read secrets files at all. This is
  defense in depth: the proxy redacts secrets in tool results anyway.
- `disableBypassPermissionsMode`: no `--dangerously-skip-permissions`.

Quick test without installing:

```bash
ANTHROPIC_BASE_URL=http://localhost:8080 ANTHROPIC_AUTH_TOKEN=emp-alice \
  ANTHROPIC_MODEL=deepseek/deepseek-v4.1-flash-1017 claude
```

## pi

Merge `pi/models.json` into `~/.pi/agent/models.json`, then choose a model from
the `aegis-anthropic` or `aegis-aipro` provider. `apiKey` reads the employee
token from `$AEGIS_EMPLOYEE_TOKEN`; pi also accepts `"!command"` to run a token
helper instead. Tested with pi 1.4.0 against a local proxy: secrets in files
pi read were redacted, a confidential board pack was held with a ticket, and
both providers' requests appear in the ledger under the employee token.

Quick test without touching your pi config (`PI_CODING_AGENT_DIR` points pi at
another config directory):

```bash
mkdir -p /tmp/pi-aegis
sed 's#https://aegis.corp.example#http://localhost:8080#' pi/models.json > /tmp/pi-aegis/models.json
PI_CODING_AGENT_DIR=/tmp/pi-aegis AEGIS_EMPLOYEE_TOKEN=emp-priya \
  pi -p --model aegis-aipro/aipro-chat "hello"
```

## AIPro and other OpenAI-compatible clients

Set the client's OpenAI base URL to `https://aegis.corp.example/v1` and its API
key to the employee token. Model `aipro-chat` maps to the route in
`config.yaml`. For example, with the OpenAI SDK:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8080/v1", api_key="emp-bob")
client.chat.completions.create(model="aipro-chat", messages=[{"role": "user", "content": "hi"}])
```

## Why users can't simply bypass it

A base URL is only a convenience. The control comes from three locks:

1. Key custody: the proxy holds the provider keys.
2. An egress allowlist: only the proxy may reach AI provider domains.
3. This managed settings file.
