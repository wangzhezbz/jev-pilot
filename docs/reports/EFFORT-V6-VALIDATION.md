# Bounded reassessment — 2026-09-23

Policy: `effort-v6-bounded-reassessment`. This resolves the routing-budget finding in the [preceding audit](CURRENT-AUDIT-20260923.md).

## Changes

- Nearby tool completions share a fixed 50 ms settling window before the evaluator sees an immutable snapshot. Continuous traffic cannot extend this window. Later conflicting evidence still invalidates a judgment.
- The total evaluator limit remains six per turn. Ordinary calls can use four; subsequent calls require an unjudged failure, user steering or published progress/plan change. A routine stale refresh cannot consume reserved capacity.
- Once an applicable reuse lease expires or is invalidated, unavailable evaluator capacity no longer leaves an automatic downgrade in force indefinitely. Code requests the turn's original user-selected effort, or the latest successfully confirmed manual setting. A stronger current effort is never lowered by restoration.
- Restorations wait for native acknowledgment and use a separate `effort_restore` event. Manual updates fence in-flight writes. Unconfirmed publications suspend competing writes; rejected restorations do not retry on every boundary. Reports separate restoration receipts, stale judgments, budget skips and coalesced boundaries from Jev decisions. Recorded wait includes the settling window for attempted judgments and native restoration waits; restorations do not count as Jev requests.

## Evidence

- **118 regressions passed**, including delayed parallel completions, interruption during settling, reserved late-failure/input/plan judgments, stale results at the routine limit, manual-setting races, evaluator budget failure and native timeouts.
- Original macOS Codex engine, synthetic GPT/evaluator endpoints: Astra, Sol and Luna each sent eight requests with efforts `low, low, low, low, high, low, low, high`. Each used six evaluator calls and confirmed two baseline restorations. Models were preserved. The Astra run preserved the serialized initial input prefix throughout; this is not a cache-hit measurement.
- GPT-5.6 Sol manual setting regression passed: outgoing requests changed from low to medium. Automatic output filtering regression also passed.
- A controlled overlapping-output comparison used two synthetic evaluator calls without settling and one with the 50 ms window; both ended at low. This is a controlled mechanism check, not a measured real-task speedup.
- One real Jev 1.13.0 call used **868 input / 106 output tokens**, with **554 ms** recorded decision elapsed time. The original engine forwarded low and reused it for the next synthetic model request. No paid GPT calls or quota retries were made.

Machine-readable evidence: [effort-v6-validation.json](effort-v6-validation.json). TypeSafe's current [state](https://docs.typesafe.ai/concepts/state) and [Choice](https://docs.typesafe.ai/primitives/choice) documentation were checked; this change retains the existing typed API contract.

## Activation and remaining limits

The updated plugin/adapter is installed for the next normal desktop launch. The already-running desktop process retains v5; v6 ordinary-session activation must be verified after restart. No forced app restart was performed.

Coalescing does not eliminate results arriving after its bounded window. The total and shared budgets remain finite: after exhaustion, baseline restoration is a deterministic fallback, not an unlimited Jev service. A native publication can still fail; only an actual acknowledgment is counted as applied. Full matched performance, representative ordinary-task coverage, dependency-bundled consumer installation and Windows/Linux real-device acceptance remain separate open work.
