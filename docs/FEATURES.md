# JevPilot 0.2: fourteen feature areas

macOS delivery candidate; final evidence is tracked in [delivery ledger](DELIVERY-PLAN.md). Code and automated tests exist for all areas; host integration has separate acceptance gates.

| # | Feature | Implemented behavior | Acceptance boundary |
|---|---|---|---|
| 1 | Automatic judgments | One implicit skill and MCP tool; batched choices, caching, limits and fallback | Codex invokes eligible semantic work; deterministic work stays local |
| 2 | Actual effort routing | First-request parameters and acknowledged native updates; adaptive leases; model preserved | Real macOS engine tested with synthetic inference; new installation needs a new app process |
| 3 | Search/file screening | rg candidates, exact source lines/hashes, relevance/diversity | Candidate limits and omitted evidence reported |
| 4 | Recoverable output filtering | Saved logs; automatic large-text filtering at tool boundaries; original recall | Structured data and exact-output tasks bypass filtering; native hook replacement verified on the original macOS engine |
| 5 | Tool/skill selection | Required and uncertain candidates remain available | Does not rewrite the native tool registry |
| 6 | Failure recovery | Fingerprinted failures, bounded suggestions, unchanged-retry guard | No execution of unchecked recovery actions |
| 7 | Evidence/content quality | Subprocess receipts, source freshness, requirement/rule/translation checks | Codex performs final acceptance |
| 8 | Chrome/Computer Use | Existing-driver coordination, fresh snapshots, single-use tickets, loop bounds | Actual Computer Use and real Chrome extension pass; stale observations and reused tickets rejected; see acceptance report |
| 9 | Project memory | Opt-in, sources, expiry, conflicts and revocation | No unauthorized persistent memory writes |
| 10 | Usage and results | Real Jev usage/latency, native receipts/usage, local dashboard | No invented time or quota savings |
| 11 | Context compaction | Recoverable handoffs, protected exchanges, stable decisions, early output filtering | Handoff does not rewrite native history or reclaim existing tokens |
| 12 | Change review | Diff triage, relevant tests, required/changed/uncertain tests retained | Mandatory checks and final review still required |
| 13 | Checkpoints/resume | Milestones, source hash validation, automatic tool-boundary checkpoints | No blind replay; automatic checkpoints require reinspection |
| 14 | Exact-source extraction | Verified original offsets, missing/ambiguous states | Source occurrence is not proof of correct entity or factual truth |

One shared private SQLite store and TypeSafe client serve these modules. The desktop bridge reaches the actual runtime; semantic recommendations alone do not change effort.

Models: `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`. Effort choices are checked against each model's live runtime metadata; automatic routing does not select `ultra`. Unknown models preserve current settings. Initial verified Codex wire version: `0.155.0-alpha.9.2`. Unknown versions pass through until verified.

## Use

See the [one-plugin installation procedure](INSTALL.md).

Install one plugin, configure a personal TypeSafe key once, then work normally. The bundled skill handles eligible calls and setup; no task files or separate runner per request. The local dashboard supports English, Chinese, Russian, Japanese and Korean. Credentials stay in local `.env.local` or process environment and are never returned by the dashboard API.

Development requirements: Node 24+, curl and rg. `node scripts/cli.mjs setup` prepares the removable adapter; `setup --activate` configures the next launch. `doctor`, `report`, `dashboard`, `enable` and `disable` share the same CLI. The agent handles these for ordinary users. `node scripts/build.mjs` builds the native launcher; distribution packages contain it so consumers do not need Go. Source builders need Go.

Windows/Linux runtime code and launchers are implemented. Compilation is not OS acceptance. CI validates the portable core separately from real desktop/client operation. No app bundle patching. Future Codex versions require compatibility tests.

## Verification

`npm run check`: syntax, JSON and credential-pattern scan. `npm test`: modules, MCP, privacy, recovery, failures, router and dashboard. `scripts/verify-desktop.mjs`: actual Codex engine with synthetic model endpoint. `npm run smoke:live`: small **paid TypeSafe** synthetic sample, no GPT calls. CI: macOS, Windows and Linux portable tests.

See [full acceptance report](reports/ACCEPTANCE.md), [live API results](reports/live-smoke.json), and [implementation ledger](IMPLEMENTATION.md). Reports distinguish these evidence layers.

## Reliability and evaluation additions

Shared request/byte/wait budgets and a service cooldown cover both desktop routing and MCP semantic calls. Task scope is used when the host supplies an identifier; otherwise diagnostics explicitly show a workspace/hour scope. API failures preserve the native workflow.

Evidence policies now keep uncertain candidates, pending work, errors and source paths; deduplicate before requesting Jev; and share task instructions once per request. Disabling cache disables both lookup and insertion. Project memory ranks all valid entries before taking the bounded candidate set.

Shadow mode records proposed evidence exclusions without applying them. Labeled policy evaluation separates fit and independent holdout groups, reports precision/coverage/false exclusions and a one-sided interval, and never activates itself. An initial 0.9 exclusion probability is not an empirically calibrated guarantee.

The local dashboard exposes these diagnostics in all five languages. Reload preserves the local tab's authorization; built-in localization is not overwritten by browser auto-translation.
