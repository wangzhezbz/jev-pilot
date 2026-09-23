# macOS delivery completion ledger

Goal: finish and improve the existing fourteen features, compare with current upstream implementations, fix review findings and deliver normal Codex desktop use. Windows/Linux real-device acceptance is excluded by the user. Source snapshot at start: 035101a.

Requirements and evidence to collect:

- [x] Fix long shared instructions, full-request/state budgets, cache-off semantics and pre-judgment deduplication; boundary regressions and small real Jev verification.
- [x] Preserve uncertain evidence, unfinished work and source/path constraints; test complete exchanges and recoverability, including multi-batch failures.
- [x] Add bounded task-wide request/byte/wait budgets and failure cooldown, shared across calls; verify cancellation, recovery and no unexpected model switching.
- [x] Add labeled policy evaluation and shadow mode with independent holdout results, versioned policies and honest missing-evidence reporting.
- [x] Expose decision/skip/cache/fallback diagnostics and coverage in the five-language dashboard; verify rendered UI through the supported browser plugin.
- [x] Recheck all fourteen features against their actual contracts, with live Jev plus synthetic faults and real host tests. Add tests only where they catch meaningful behavior.
- [ ] Run matched, quality-accepted real workloads; report raw elapsed/token data and Jev overhead without requiring a positive saving.
- [x] Package and verify macOS install/update/disable/rollback, native tool discovery and the actual Chrome path. Keep ordinary user workflow and current model.
- [x] Recompare relevant current upstream code and official API after implementation; resolve findings.
- [ ] Deliver reviewable artifacts, updated docs and GitHub development state with passing checks. Record any certificate/host capability that cannot be supplied locally without disguising it as complete.

No completion claim until requirement-specific evidence is recorded. Passing unit tests is not desktop or performance acceptance. No official Codex binary patch for browser networking. No API keys in artifacts. Existing upstream copyright notices are retained.

Earlier ordinary-workflow check: [report](reports/ORDINARY-WORKFLOW-ACCEPTANCE.md). 108 regressions passed; current-agent live Jev selection and recoverable filtering passed; dashboard activation/coverage distinctions passed in Chrome. v5 desktop activation was verified in [restart evidence](reports/restart-v5-activation.json): the loaded fingerprint matches the installed v5 adapter, and this ordinary conversation received a native high → medium settings-publication receipt. Full performance acceptance remains open. Windows/Linux real-device acceptance remains unverified and outside this macOS delivery scope.

## Current evidence

- 107 local regression tests passed after the routing freshness review; syntax, JSON and credential-pattern checks passed. See `reports/EFFORT-V5-REVIEW.md` for the additional context, manual-settings and revision checks.
- Real TypeSafe smoke: 11 calls, 9 scenarios passed. Additional policy/long-shared-instruction regression: 3 calls, 32 labeled cases and 24 long-instruction candidates; zero observed false exclusions. Sample size is explicitly insufficient for a calibrated production threshold.
- Real bundled macOS engine: first-request routing, later native applied receipt, output filtering, network-unavailable fallback, incompatible-version fallback and disabled-adapter pass-through passed with synthetic model responses. Installed adapter + real Jev also passed. These checks consume no GPT model quota.
- Plugin version `0.2.0+codex.20260923030550` passed the original native discovery check; the follow-up v5 routing update uses `0.2.0+codex.20260923033429`. A failed isolated update restored the prior manifest and compatibility. Current desktop processes have not been forcibly restarted; installation and loaded revision remain separate evidence.
- Chrome extension: five-language dashboard, shadow setting and page reload verified; no console errors. Browser auto-translation interference and refresh authorization loss were fixed.
- Real-model benchmark stopped at 12/24 attempts due to a provider usage limit: 11 quality passes, 1 quota failure, 9 effort changes. The failed attempt is retained, no quota retry. See `reports/benchmark-partial.json` and CSV. Final savings and full benchmark acceptance remain pending.
- Eleven upstream default-branch heads were rechecked; changes to two were reviewed. Runtime/provider telemetry and per-passage caching improvements were distinguished from unrelated model/provider expansion. Existing direct-vendor files remain unchanged with their license.

This is a delivery candidate, not a claim that the entire delivery goal or performance acceptance has finished.

Packaged macOS candidate: `dist/delivery-macos-20260923/jev-pilot-0.2.0.tgz`; 94 files, private-file/path scans passed, installation from the extracted archive passed in an isolated home. Exact checksum is in `reports/package-acceptance.json`.

Latest routing update: [v6 validation](reports/EFFORT-V6-VALIDATION.md). 118 regressions passed; bounded coalescing, reserved reassessment capacity and receipt-backed baseline restoration are implemented. Installed v6 must be distinguished from the still-running v5 desktop process until a normal restart.
