# Implementation ledger — 0.2 development preview

All fourteen agreed feature modules are implemented behind one MCP tool and one implicit skill. See [FEATURES.md](FEATURES.md) for the feature-by-feature acceptance boundary. This is a runnable developer preview, not a completed three-platform desktop release.

## Architecture delivered

- Shared TypeSafe transport with bounded batches, deadlines, cancellation, schema checks, caching and fail-open behavior.
- Private project-scoped SQLite state for recoverable evidence, receipts, checkpoints and opt-in memory.
- Original desktop v4 routing migrated with all 28 regression tests; actual first-request parameters and native acknowledged updates.
- Native Go launchers for macOS/Windows/Linux, x64/arm64; Node backend; Unix sockets or Windows named pipes.
- MCP stdio server, ordinary-work implicit skill, native tool-boundary output filtering and checkpoints.
- Localhost dashboard with English, Chinese, Russian, Japanese and Korean.

## Review corrections made

1. Windows checkout line endings changed pinned vendor hashes: enforce LF and mark vendored bytes immutable.
2. Legacy plugin MCP fields were not enough for the native host: add portable `plugin.json` and `mcp.json`, verify with the actual Codex app-server.
3. Native output replacement uses the host's supported `continue:false` feedback path; do not pretend an unsupported field changes context.
4. Checkpoints and test receipts become stale when their sources change; revalidate hashes before resume/completion/memory retrieval.
5. Search overflow inside one file is now visible; original evidence remains retrievable.
6. Disabled project settings apply to the desktop hook and first-step router; cancellation prevents new API work.
7. Browser decisions lock each session, reject stale states and consume tickets only once.
8. Native launcher corruption falls back to the original runtime without leaking the TypeSafe credential.
9. Updating preserves activation metadata and backs up the native launcher. Real macOS activation/update/rollback restored the prior launch agent and override byte-for-byte.
10. Five READMEs now show all 14 modules and consistent platform/acceptance boundaries.

11. Literal search escapes regex metacharacters through ripgrep fixed-string mode; check subprocesses do not inherit the TypeSafe key. Both paths have regression assertions.

## Verification and open release gates

See [ACCEPTANCE.md](reports/ACCEPTANCE.md) for machine-readable evidence and limitations. Portable OS CI is separate from real desktop acceptance. Remaining release gates: Windows/Linux real desktop sessions; signed consumer installers; matched real GPT workload performance measurements. The real Chrome extension path now passes with TUN off; see [Chrome acceptance](reports/CHROME-ACCEPTANCE.md). Native context-history replacement is not part of the implemented handoff interface.
