# Shared urgent budgets, routing visibility and recoverable checkpoints

2026-09-23 · Policy `effort-v8-reserved-wait`.

## What changed

1. **Less repeated judging:** a validated `keep` at or above the user's confirmed baseline may reuse up to two tool boundaries when Jev supplies a valid stability horizon. An uncertain automatic downgrade still expires after one boundary. Explicit supported-effort decisions retain their existing adaptive horizons. Original and effective horizons are logged separately, including the reason for any restriction.
2. **Shared urgent capacity:** ordinary routing and semantic requests preserve up to two calls, 4,000 ms and 100,000 request bytes for urgent rechecks/recovery. Each reserve is capped at 20% of the existing task/hour total; totals are unchanged. Native failures, user input and new public progress can trigger urgent reassessment. Concurrent reservations count against the same SQLite budget. The v7 restriction on late new downgrades remains.
3. **More output filtering:** a strict single-text MCP envelope is eligible alongside plain shell text. Envelope fields remain intact in the replacement JSON; the original text remains recoverable. Structured content, JSON text, annotations, errors, mixed media and nested code-mode outputs pass through. Existing size and two-per-turn limits remain.
4. **Task activity:** the five-language dashboard shows the latest 100 project-scoped routing records, with a task filter, proposed/applied effort, timing, usage and original/effective horizon. Synthetic runs and older logs without a project identifier are excluded. This is metadata, not a complete transcript or savings estimate.
5. **Useful checkpoints:** automatic records retain observed plans, public progress, native command receipts and an eligible changed-file hash snapshot at turn completion. Limits are 30 plan steps, 20 receipts and 40 files. Missing Git baselines or unreadable/deleted files are reported as unavailable/partial coverage. Resume always revalidates automatic records and never replays side effects automatically. A successful tool command or completed plan step does not establish requirement completion.
6. **Setup and compatibility:** the dashboard checks dependencies and offers authenticated adapter preparation/update with concurrent-update protection. An isolated compatibility operation discovers hooks without activating unknown Codex versions. The existing version gate remains.

The two reviewed official TypeSafe contracts remain [Choice](https://docs.typesafe.ai/primitives/choice) and [State](https://docs.typesafe.ai/concepts/state). Classification scores are not treated as authorization or calibrated correctness.

## Validation

- **139 regressions passed**, zero failures. Includes shared byte/wait/call reserves, concurrent in-flight capacity, failure and progress recovery after an early budget block, baseline-only `keep` reuse, MCP envelope preservation, project isolation, checkpoint recovery and authenticated setup concurrency.
- **Six original macOS engine scenarios passed**, using synthetic GPT and evaluator responses: GPT-6 Astra/Sol/Luna budget behavior, GPT-5.6 Sol manual settings, shell filtering and MCP text filtering. No paid GPT model calls. The final MCP scenario also verified a native completed-turn automatic checkpoint with public progress and mandatory revalidation. See [machine-readable evidence](effort-v8-validation.json).
- MCP fixture: original serialized envelope **25,270 bytes**, source text **24,864 bytes**, replacement **2,411 bytes**. Target evidence and JSON envelope survived into the next model request. This is synthetic byte reduction, not measured token savings or a representative quality benchmark.
- Four real Jev attempts on synthetic stability states: two standalone requests timed out; their usage is unknown. Two subsequent requests through the production proxy-aware transport succeeded. Stable state: `low`, horizon `5`, **999 ms**, **844 input / 106 output tokens**. Unresolved state: `xhigh`, horizon `1`, **550 ms**, **830 input / 107 output tokens**. Successful total: **1,674 input / 213 output tokens**. Failures are retained in [probe evidence](effort-v8-horizon-probe.json). These samples show different valid horizons, not the root cause of every earlier one-step decision.
- The actual Chrome extension rendered English, Chinese, Russian, Japanese and Korean. An isolated fixture verified populated task records, task filtering and the setup button's restart message using a mock installer. Reload preserved authorization and Chinese. Full-page layout was inspected; no console errors were observed. Existing user settings were not used for these writes.
- Isolated hook discovery passed on `codex-cli 0.155.0-alpha.9.2`; it did not activate a different runtime version.

## Delivery and remaining work

The source changes above are implemented. Installed and loaded revisions must be checked separately: the already-running desktop remains on v7 until a normal restart. New project-scoped timeline records start with the loaded v8 bridge; old records are not retroactively assigned to projects.

Installed plugin: `0.2.0+codex.20260923062248`. Plugin/skill validation and original-host MCP discovery passed. Adapter hashes are compatible; installed fingerprint `91d651b9876ae124582dec53963247c5a00c7db28c3a773691d87fc6fb152a5c`. Doctor still observes the live v7 fingerprint, so v8 is configured for the next normal launch and is not claimed active in this task. A new task after restart picks up the updated plugin tool registry.

| Earlier optimization area | Current state |
|---|---|
| Reduce repeated judging and protect urgent capacity | Implemented and regression-tested; ordinary v8 activation still needs restart verification |
| Broader automatic output filtering | Strict MCP text support implemented and native-engine verified; typed and nested results remain unchanged |
| Easier installation | Checklist and preparation button implemented; dependency-bundled, signed consumer installers remain open |
| Per-task activity | Implemented and five-language UI tested; latest 100 scoped records, no historical backfill |
| Checkpoint/resume | Automatic evidence capture and revalidation implemented; no native history rewrite or blind task replay |
| Codex upgrade compatibility | Read-only hook probe implemented; unknown versions still need native routing acceptance before enabling |
| Quality-matched performance | Still incomplete after the earlier 12/24 provider-quota stop; no new paid GPT benchmark or savings claim |

Windows/Linux automated checks are distinct from real desktop acceptance. Incremental evidence reuse and retention/cleanup remain future work; this update does not delete stored records. Full-log reads in the timeline remain a scalability limitation. No claim of stable speed, token or subscription-credit savings is made.
