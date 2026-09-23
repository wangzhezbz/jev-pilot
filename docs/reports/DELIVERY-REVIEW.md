# JevPilot delivery review

Status: macOS delivery candidate. Core fixes and local/native-engine acceptance are complete; a provider usage limit interrupted the planned performance benchmark. Windows/Linux desktop acceptance is outside this round. Do not advertise a savings percentage from this partial run.

## What changed

- Shared task instructions appear once per request. Batches check the full serialized request and state plus the longest question. Oversized candidates stay visible as explicit fallback.
- Cache-off means no reads or writes. Duplicates are removed before Jev judgments; originals and alternate sources remain recoverable.
- Uncertain exclusions, optional test deferrals and tool/memory omissions are retained. Errors, pending work and source paths have deterministic protection. Any failed compaction batch preserves the whole exchange set.
- SQLite request reservations share request-count, request-byte and wait budgets across calls and the desktop bridge. Scopes are task/hour or an explicitly reported workspace/hour fallback. Service outages trigger a bounded cooldown and one recovery probe. Cancellation is not a service failure; late successes cannot erase newer outage state.
- Labeled policy evaluation separates fitting and held-out samples, detects duplicate/cross-split groups and never activates itself. Shadow mode records proposals without applying evidence exclusions.
- Diagnostics show admission, fallback, actual exclusions, budget scopes and cooldowns. All five locales are available. Desktop global counts are distinguished from project-local semantic counts.
- Memory candidates are ranked across valid history before the 100-item limit. The user's chosen GPT model remains unchanged.
- The dashboard survives reload and retains its own localization when Chrome has automatic translation enabled.

## Acceptance evidence

| Layer | Result | What it establishes |
|---|---|---|
| Local regressions | 106 passed after v5 follow-up | Deterministic contracts, failure behavior, concurrency budgets, evidence retention and stale-routing protection |
| Paid TypeSafe smoke | 11 calls, nine scenarios passed | Current API integration, usage and bounded semantic examples |
| Policy regression | 3 calls; 32 labeled cases; 24 long-instruction candidates | No observed false exclusions in this small synthetic set; not production calibration |
| Original macOS engine | Routing, native applied receipt, output filtering, outage/version/disabled fallback passed | Actual request parameters and native hooks, using synthetic inference |
| Installed adapter | Real Jev chose low; actual synthetic model requests used low | Packaged adapter path works; no paid GPT calls in this check |
| Native plugin loading | New version exposes `jev_pilot` | Host discovery, not just a manifest on disk |
| Update rollback | Failed isolated update restored previous manifest and compatibility | Installation recovery without changing global launch settings |
| Chrome | Five locales, shadow setting, refresh persistence, zero console errors | Rendered and interactive dashboard through the existing official extension |
| Packaged macOS install | Archive scan and isolated install passed | The distributable contains its native launcher and installs from extracted files |
| Real model benchmark | 12 of 24 attempts; 11 passed, one provider quota failure | Partial observed data only; no final savings claim |

Machine-readable evidence is in [delivery-acceptance.json](delivery-acceptance.json), [live-smoke.json](live-smoke.json), [policy-regression.json](policy-regression.json), [benchmark-partial.json](benchmark-partial.json) and [benchmark-partial.csv](benchmark-partial.csv).

The subsequent [v5 routing review](EFFORT-V5-REVIEW.md) adds manual-settings fences, bounded public context, stale-result protection and installed-versus-loaded revision diagnostics. Its [separate validation](effort-v5-validation.json) does not replace historical benchmark or package evidence.

The benchmark used a frozen source snapshot and paired fixed-high versus automatic arms on Astra and Sol. Later diagnostic ordering, synchronous-error cleanup and manifest checks are separately covered by regressions. This is not a full benchmark of the final packaged revision. The original failed run stays in local raw evidence; the public summary identifies the provider limit without publishing account-specific reset details.

## Remaining boundaries

- Complete the planned benchmark after model access is available; do not buy credits, change accounts/models or retry a quota error automatically.
- Current desktop processes may still use the previous adapter. Normal restart/new-task pickup is distinct from installation and isolated engine acceptance.
- Initial exclusion probability 0.9 is a conservative rule, not calibrated accuracy. Larger independently labeled production sets are still needed for a domain-specific threshold.
- Native history is not rewritten. Context compaction is a recoverable handoff; eligible long-text outputs can be filtered before consumption. Structured/nested tool contracts stay intact.
- Cache reuse across different batch compositions and cross-process in-flight merging remain possible optimizations, not existing guarantees.
- One plugin packages the components; Node 24+, curl, ripgrep, TypeSafe access and an accepted Codex wire version remain prerequisites. This is not a signed standalone application installer.
