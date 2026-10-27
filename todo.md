# todo — guardrails proxy

Feature playbook steps:

1. `how` over the affected subsystem — skip: empty greenfield repo, no subsystem to explore; design done by parent.
2. `architect` for parallel design exploration — skip: greenfield, single coherent pipeline design by parent, no existing constraints to explore against.
3. Write the throughput checkpoint as four todo items — done inline below.
4. Delegate code-writing to a subagent with scope, data shape, success criteria — delegate to poteto-agent with worktree.
5. Verify on the matching surface — real proxy binary, real e2e smoke run.
6. Rebase into small, ordered commits — commit per unit, then merge.
7. If the design is contested, `interrogate` before shipping — decide at review time.
8. Run **Opening a PR** — not a git repo with a remote at session start; commit locally, note as follow-up.

Throughput checkpoint:

- **Blocking first steps.** Design doc + config data shape + git init/commit; delegate cannot start until the design and pipeline contract exist.
- **Independent workstreams.** None at parent level; the whole thing is one code-coupled feature (one pipeline, shared packages). The delegate fans out internally if needed.
- **Shared mutable state.** Cache, budgets, audit log are per-process state owned by the proxy server; no concurrent writers outside the process. Vault is per-request. No file serialization races.
- **Smallest safe decomposition.** One worker is best: single fresh greenfield pipeline, packages share the core config/PII types; two workers would conflict on the same files.

Checklist:
- [ ] Design doc (DESIGN.md) — modified idea
- [ ] git init + scaffold commit
- [ ] Delegate implements core packages
- [ ] Delegate implements proxy HTTP layer + cmds + config example
- [ ] Delegate implements tests + e2e smoke test
- [ ] Parent review + verify on real binary
- [ ] Commit + merge
