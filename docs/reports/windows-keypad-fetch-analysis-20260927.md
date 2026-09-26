# Windows documented-key and fetch diagnosis

Source: user-supplied WINDOWS_KEYPAD_ERROR_RESULTS.md / WINDOWS_KEYPAD_ERROR_EVIDENCE.json (2026-09-27).

The calculator was not run: our previous handoff required exact KP_Add documentation, while the installed official docs explicitly listed Numpad_Add and Numpad_Multiply. This was a handoff and driver allowlist mismatch, not evidence that documented addition failed. The candidate driver now accepts and preserves those two exact single-key names. Skill guidance uses them; historical generic and KP spellings remain opt-in compatibility inputs. No automatic alias rewrite, shortcut broadening, progress-guard removal, or production installation was made.

Chrome bootstrap and selection succeeded, but tabs.list rejected after 21013 ms with the exact local error message `nodeRepl.fetch request failed`. The captured object had only a message, without code, cause or HTTP status. Neither the 45000 ms observation budget nor the 60000 ms outer budget expired first. The root cause remains unknown.

Read-only inspection of the locally installed official browser-service.mjs 26.917.71314 shows privileged nodeRepl capabilities are passed into the service, including fetch. The service also has remote identity/configuration requests. This supports treating native fetch as a separate diagnostic boundary; it does not prove which remote request failed on Windows or establish a VPN/identity cause. We do not modify that service or call its internal endpoints.

Fixes: preserve the exact known-safe fetch failure marker and a UTC start time for log correlation; keep raw errors only in explicitly requested local-memory capture; mark browser-network results as configuration-only with runtime/native-fetch connectivity untested. Existing statuses remain compatible. Avoid further unchanged retries or speculative proxy writes.

Windows arithmetic with the documented names and full Jev session behavior remain unverified. Official-host network repair requires Windows-side diagnostic evidence; no claim of a fixed Chrome connection is made.
