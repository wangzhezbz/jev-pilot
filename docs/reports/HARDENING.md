# 2026-09-22 scan and Chrome investigation

Optional design credits and repository-reference lists were removed from the five READMEs, feature/implementation docs and code comments. The exact-source hash manifest remains for integrity verification. The copyright and permission text accompanying directly included MIT code remains in its license file.

## Fixes

| Problem | Changed behavior | Verification |
|---|---|---|
| Cancelled checks could continue running commands | Abort reaches the current subprocess; later checks never start | Cancellation receipt and next-command sentinel test |
| Compaction relied on English failure words | Only successful completed read-only exchanges are eligible; failed, cancelled, in-progress and unknown statuses stay intact | Non-English failure and unfinished-state tests |
| Occupied dashboard port caused an unhandled error | Startup rejects cleanly and closes its store | Real occupied-port test |
| Missing Node could prevent original Codex startup | Native launcher falls back to the original engine without the TypeSafe key | Native launcher execution test |
| Incomplete install metadata could crash doctor | Missing/malformed hash manifest reports incompatible | Corrupt-install test |
| Newer exited probe hid a still-running bridge | Doctor checks all non-synthetic bridge records and chooses a live pair | Live/dead process and malformed-line test |
| Fixture counters could enter ordinary runtime totals | New verification runs mark all events synthetic; reports exclude them. Exact, evidence-verified legacy thread IDs can be excluded privately without deleting audit logs | Mixed real/synthetic/legacy metrics test |
| Failed macOS activation could leave a replaced login job | Restore previous plist and loaded job on bootstrap or final-commit failure; restore previous override/config | First-install, existing-install and commit-failure fault tests |

Local suite: **64 passed, 0 failed**. Syntax/JSON/secret-pattern checks pass. Six native launcher builds succeed. Original Codex engine reassessment fixture passes with four `low` requests followed by `medium`, using a synthetic model endpoint and no paid GPT inference. Plugin manifests validate. Cross-platform CI for this change is linked from the pull request; local macOS results do not certify Windows/Linux desktop adoption.

The installed adapter was refreshed while preserving activation. Current running processes retain their already-loaded code; the new bridge code takes effect on normal restart. New tasks load the refreshed plugin cache. No restart was forced during this investigation.

Jev was used for bounded risk and test triage (two actual review judgments). This scan is not a time/token savings benchmark.

## Chrome: narrowed down, still unresolved

1. The supported Chrome browser API discovers the extension. Its first `nameSession` control request times out before any Jev judgment or webpage operation.
2. The native Computer Use API can inspect Chrome. The enabled ChatGPT extension is version `1.26.901.11451`; its side panel loads normally. The inspected service-worker console displayed no errors.
3. Native messaging registration points to an existing official host executable. Its child app-server is byte-identical to the bundled original Codex engine, not the JevPilot launcher.
4. A targeted restart of only that native messaging host succeeded: Chrome recreated both host and app-server. Browser windows were kept open. The next control request still timed out after 20 seconds.
5. Desktop logs separately contain a bundled-plugin registration error creating a Brave profile directory (`EPERM`). This is a diagnostic lead, **not a proven cause of the Chrome timeout**. An IAB route warning is also present; it concerns a different backend and does not establish Chrome causality.

The current evidence locates the failure in the host-to-extension command path, before JevPilot page selection/execution. It does not identify the precise failed component or prove every possible interaction with the desktop adapter has been excluded. Next acceptance requires a successful Chrome session command, fresh page observation, one bounded operation and independently observed result. Headless Chrome and native Computer Use remain separately validated paths; they do not replace extension acceptance.

No browser security settings, extension permissions, credentials or account state were changed. Raw browser/desktop logs and user page contents are not included in this report.

## Other release gates

- Real Windows and Linux Codex desktop activation, actual request routing and rollback still need those environments.
- Public signed one-click installers have not been released.
- Stable time, token and account-quota savings still require equal-quality paired real workloads.
