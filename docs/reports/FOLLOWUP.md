# 2026-09-22 follow-up acceptance

## Reliability changes

- The long-lived effort judge now reads the private credential file at each actual decision. Adding or replacing the key takes effect without restarting an already updated bridge; removing it stops file-backed calls. Explicit process credentials retain precedence. No credential is logged or returned.
- The native launcher treats missing/empty integrity metadata and a missing Node path as invalid. When the original engine path is known, normal Codex requests pass through to that engine without the TypeSafe credential or recursive launcher override.
- Installation checks Node 24+, curl and ripgrep before backing up or changing the installed adapter. Missing prerequisites produce a specific error.

67 local tests pass. New cases cover all missing prerequisites, late credential setup, rotation/removal, environment precedence and native fallback for empty/missing hashes or Node. Original-engine routing is separately checked with the synthetic inference endpoint. These tests are not a savings measurement. Actual Windows/Linux desktop startup acceptance and signed consumer distribution remain open.

## Actual Chrome fallback exercise

The Chrome extension was discovered again, but its first session-naming command timed out after 20 seconds. No extension repair is claimed.

Using the existing Computer Use plugin, the agent opened a new synthetic localhost page in the user's running Google Chrome. The observed page contained a heading, `Status: waiting` and one `Verify connection` button. Only this synthetic page's relevant text and target were sent to Jev; no account, other tab or browser-history content was sent.

Jev selected the verification button. The agent re-observed the page, consumed a fresh one-use Computer Use ticket, clicked once through the native plugin and independently observed `Status: verified`. The test tab was closed and the local fixture server stopped afterwards. This demonstrates the already-documented same-browser fallback for a simple page action. It does not certify the extension API or arbitrary browser workflows.

The follow-up used three actual Jev judgments: two for risk/test triage and one for the browser candidate. Implementation and final verification were performed by Codex. No paid GPT benchmark was run.
