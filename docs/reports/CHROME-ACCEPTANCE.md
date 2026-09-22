# Real Chrome extension acceptance — 2026-09-22

The real Chrome extension path passes on the available Mac, with the VPN system proxy enabled and TUN disabled. This is a supported `cua_repl` extension session (browser type `extension`), not a headless replacement or a Computer Use fallback.

## End-to-end result

Own synthetic localhost page, three candidate buttons: open details, help, reset. No private browsing content sent to TypeSafe.

1. Actual Jev request selected **Open details**.
2. Chrome translated the page into Chinese before execution. A fresh accessibility observation differed from the decision snapshot. Consuming the old ticket returned `STALE_OBSERVATION`; no click executed.
3. A second actual Jev request evaluated the Chinese snapshot and selected **打开详情**.
4. Re-observation matched; ticket consumption succeeded; the Chrome plugin clicked once.
5. Independent accessibility observation showed **Details opened** and the details button disabled.
6. Reusing the consumed ticket returned `INVALID_BROWSER_TICKET`; no second click executed.

| Measured item | Result |
|---|---:|
| Actual Jev API requests | 2 |
| Candidate judgments | 6 (3 per request) |
| Model reported | jev-1.13.0 |
| Input tokens | 1,701 (821 + 880) |
| Output tokens | 222 (111 + 111) |
| API elapsed time sum | 1,184 ms (611 + 573) |
| Browser clicks executed | 1 |
| Independent final page check | Passed |
| Stale observation rejection | Passed |
| Ticket replay rejection | Passed |

Usage was read from the project SQLite receipts at 2026-09-22T05:16:28.263Z and 2026-09-22T05:16:47.005Z. API latency is not task wall time or savings. The test tab and local server were closed after acceptance.

## Networking repair delivered

Root cause and isolated original-runtime reproduction: [Chrome network diagnosis](CHROME-NETWORK-DIAGNOSIS.md), [process probe](browser-proxy-process-probe.json).

The browser plugin's MCP environment filter omitted the existing proxy variables. JevPilot preserves proxy inheritance into the original runtime and adds the eight conventional proxy **variable names** to the known `cua_repl` manifest allowlist. It never writes proxy values, changes identity checks, or patches the official application or its launch arguments.

The plugin now checks at setup, MCP startup, and status/browser-step calls. If the host regenerates the same supported manifest layout, the next check repairs it again. Byte-identical backups are deduplicated locally. Unrecognized layouts, malformed files and redirected paths are skipped; normal JevPilot work continues. A diagnostic operation reports which versions need attention.

Limitations: configuration repair does not modify an already running child process. If the host started Chrome tools before repair, reload the browser plugin through normal controls. There is no process-killing watchdog and no claim that every future Codex update is compatible. The automatic check can be disabled with `JEV_PILOT_BROWSER_PROXY_REPAIR=0` in the JevPilot process environment.

## Remaining release gates

- Windows/Linux real desktop sessions require those devices; portable CI does not substitute for them.
- No signing identity is available on this Mac (`security find-identity -v -p codesigning`: zero). Public signed installers remain unreleased.
- Stable real workload time/token/quota savings remain unproven. Historical measurements must not be relabeled as a benchmark of this patch.

## Delivery regression

75 local tests pass. Six native launchers compile and the development package builds. The original Codex engine reassessment fixture shows low on requests 1–4 and medium on request 5. Native plugin discovery confirms `jev_pilot` in version `0.2.0+codex.20260922052705`, with zero paid GPT calls. Portable MCP manifests reject the browser-bundled-only `env_vars` field; the repair is deliberately limited to the known bundled browser manifest.
