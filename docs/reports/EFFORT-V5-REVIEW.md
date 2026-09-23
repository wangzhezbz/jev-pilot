# Effort routing freshness review

2026-09-23. Policy: `effort-v5-context-freshness`. This review improves the existing desktop adapter; it does not replace the user's Codex executable or selected model.

## Reference comparison

Reviewed [Astra-Ares](https://github.com/miuuyy/Astra-Ares/tree/a1dbc976103e300419cb0b4ab54150ad6a3e0b4b), especially `src/bridge.mjs`, `src/tool-output-budget.mjs` and the native checkpoint/context patch. The reference installer and patched executable were not run. Compatible behaviors were implemented in JevPilot's existing router; no source files from that project were vendored.

| Reference behavior | JevPilot outcome |
|---|---|
| Invalidate a decision on manual effort/model changes | Client `turn/settings/update` invalidates pending recommendations immediately. Only a successful native receipt updates observed settings. Failed or obsolete-turn changes are not treated as applied. |
| Preserve original model selection | Explicit model changes are respected. A model-only change with an unknown native effort, or overlapping publications with ambiguous ordering, suspends automatic routing for the rest of that turn. Codex continues normally; the next turn starts afresh. |
| Inspect the latest context before deciding | Completed plans and public reasoning summaries join bounded state. Raw reasoning content and encrypted fields are excluded. Plans, messages and summaries invalidate reuse. |
| Account for newly completed tools | A judgment uses an immutable snapshot. Late successful results, failures or public progress cause at most one fresh judgment. If context changes again or the call budget is exhausted, keep current effort rather than apply stale advice. New evidence arriving during native publication prevents reuse. |
| Count leases in model generations | Not adopted: the stock desktop hook exposes tool completion boundaries. Logs now explicitly record `leaseUnit=tool_completion_boundary`. Coalesced hooks are not an exact model-generation counter. |
| Confirm the next generation's captured effort | Not claimed: the stock `applied` response confirms publication for subsequent captures, not a guaranteed later inference. Logs distinguish `native_settings_published` from `start_parameter_forwarded`. Synthetic endpoint tests separately inspect actual outgoing requests. |
| Preserve prompt prefix across effort changes | Verified on the installed stock engine using five synthetic requests: low, low, low, low, medium. All preserved the original seven input items exactly. This is not a cache-hit-rate or cost measurement. |
| Retry the evaluator and stop the turn on exhaustion | Not adopted: keep JevPilot's existing short request limits, shared budgets/cooldown and fail-soft continuation. No automatic provider/account/model substitution. |
| Patched CLI plus Unix socket | Not adopted: retain normal desktop use and existing named-pipe support on Windows. Windows/Linux desktop behavior is still not claimed as real-device acceptance. |

## Verification

- 106 regression tests passed, including 13 additional race, context, receipt and revision-diagnostic cases. Syntax/JSON/credential checks passed.
- Original bundled macOS Codex `0.155.0-alpha.9.2`: manual settings on GPT-6 Astra and GPT-5.6 Sol produced low → medium outgoing requests and a matching native receipt. No paid model backend was used.
- The same engine passed failure-triggered automatic reassessment, unavailable-Jev fallback, disabled-adapter and incompatible-version pass-through. All fixture Jev decisions were synthetic.
- Installed adapter startup passed an isolated no-inference probe and recorded the expected runtime fingerprint. The probe is marked synthetic and excluded from normal task metrics.
- `desktopStatus` compares a live process's startup fingerprint with the installed manifest. Missing old fingerprints remain unknown; matching files on disk alone do not establish loaded code. Fingerprints are startup provenance, not ongoing process attestation.

Machine-readable results: [effort-v5-validation.json](effort-v5-validation.json).

## Activation and remaining evidence

The update is installed for the next normal desktop launch. At validation time, existing desktop processes still reported v4 and had no source fingerprint. They were not forcibly restarted; v5 is not claimed as active in the current desktop task.

The prior paid benchmark remains stopped at the provider usage limit. This review did not retry it, spend GPT quota or claim time/token savings. Additional public context and an occasional bounded refresh can add evaluator overhead; quality and net performance still require a complete matched workload test.
