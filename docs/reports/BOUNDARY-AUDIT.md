# Boundary review — 2026-09-22

Four additional defects were fixed after the Chrome functional acceptance:

1. Browser ticket expiry started after judgment, extending the original observation's lifetime. Expiry now remains tied to the original observation; a judgment returning after 30 seconds cannot issue a ticket.
2. Previously issued browser tickets remained valid after another decision. Only the session's current ticket can execute. Ticket issuance and consumption use SQLite immediate transactions so separate plugin processes cannot both consume the same ticket or silently lose step counters.
3. A successful proxy repair could permanently mask later manifest failures. Current readiness and an earlier repair are now reported separately.
4. The native launcher did not recognize `browser-network`, incorrectly forwarding it to Codex. It now dispatches the command to JevPilot's CLI.

Validation: 78 local tests pass, including expiry during judgment, superseded tickets, transaction rollback on failed consumption, current proxy failure after successful startup repair, and native CLI dispatch. Six platform/architecture launchers build. These are regression results; no additional real Jev or GPT performance calls were made in this review.

Remaining boundaries: Windows/Linux real desktop acceptance; signed public consumer installers; matched real-workload savings. A future unknown browser manifest is skipped. Repairing a manifest cannot change the environment of an already running browser child; normal plugin reload may still be needed.
