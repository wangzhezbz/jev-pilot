# Current desktop audit — 2026-09-23

The installed v5 runtime fingerprint still matches the active bridge. The current source passes all 108 tests and syntax/JSON/credential-pattern checks (164 files, 42 modules). Browser proxy manifest inheritance is ready; this audit did not repeat interactive Chrome acceptance. No runtime code or installation was changed.

## Priority findings

1. **Routing budget can be consumed before later phase changes.** The current ordinary turn recorded six decisions: three unchanged, two superseded and one stale-evidence result. Summed decision elapsed time was 3,287 ms, with 13,870 Jev input and 636 output tokens. This sum is not measured added task wall time. All six consume the per-turn routing limit; `Router.hook` checks that limit before urgent failure/progress reassessment. Later difficulty changes therefore retain the last effort after exhaustion. This is a verified control-flow limitation, not evidence that this turn was incorrectly downgraded. Coalescing overlapping boundaries and reserving bounded reassessment capacity need design and regression checks; blindly increasing limits would increase overhead.
2. **Automatic evidence filtering covers a limited set of outputs.** Only strings of 12,000–100,000 JavaScript characters are admitted, at most twice per user turn. Structured and nested code-mode results are preserved. Agent-dispatched semantic filtering remains necessary for other eligible work; universal automatic invocation has not been established. Context handoff does not rewrite native conversation history.
3. **Codex upgrade compatibility is deliberately narrow.** Setup accepts the verified `codex-cli 0.155.0-alpha.9.2`; unknown versions pass through without routing until verified. This protects ordinary execution but does not provide uninterrupted Jev support across upgrades.
4. **Complete performance acceptance is still missing.** The previous benchmark stopped at a provider usage limit and did not cover the final v5 revision. No paid GPT benchmark was retried. Applied settings and passing tests do not establish net token, latency or account-quota savings.
5. **Consumer/platform delivery remains incomplete.** Node 24+, curl, rg and private TypeSafe setup are prerequisites. A signed dependency-bundled installer is not shipped. Windows/Linux CI does not establish real desktop installation, routing, browser/proxy and removal acceptance.
6. **Evidence synchronization remains unfinished.** Restart evidence and its delivery-ledger update are local uncommitted changes. Historical reports describe their original observation times; readers should follow the newer restart evidence for current activation.

The existing browser repair can restore the known manifest proxy allowlist after regeneration. It cannot retroactively change an already-running browser child; that case still needs normal plugin reload. Manifest readiness alone does not prove current network connectivity.

## Recommended order

First reduce wasted routing judgments and preserve bounded handling of late difficulty changes. Then expand representative ordinary-task coverage and finalize install/update delivery. Repeat a matched final-revision performance run when provider quota is available, keeping quality failures and Jev overhead in the results. Keep platform claims bounded by actual device acceptance.
