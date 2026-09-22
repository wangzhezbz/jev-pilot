# JevPilot 0.2 implementation and acceptance

**Status: all 14 shared modules implemented; runnable development preview. Full cross-platform desktop release acceptance is not complete.**

Latest follow-up: [2026-09-22 hardening and Chrome diagnosis](HARDENING.md) — 64 local tests pass after eight reliability fixes. The earlier live-call counts below describe the original acceptance batch, not cumulative usage.

Further follow-up: [credential, startup and Chrome fallback acceptance](FOLLOWUP.md) — 67 tests pass; Computer Use successfully operates the user's Chrome on a synthetic local page while the Chrome extension command path remains blocked.

## What was exercised

| Layer | Result | Evidence |
|---|---|---|
| Local automated tests | 67 passed, 0 failed in the latest follow-up | `npm test`; router, privacy, recovery, MCP, dashboard, launcher and feature tests |
| Native plugin host | Plugin installs and exposes `jev_pilot` in actual Codex app-server; zero GPT calls | [plugin-host.json](plugin-host.json) |
| Actual Codex engine | Eight fixture scenarios pass; model preserved for Astra/Sol/Terra/Luna; real requests show selected effort; native reassessment has `applied` receipt | [native-engine.json](native-engine.json) |
| Installed adapter + real Jev | One real judgment high → low; both subsequent original-engine requests carry low | [native-engine.json](native-engine.json) |
| Native output filtering | 24,864-byte synthetic text output becomes 2,282-byte evidence feedback before the next request; original retained | Native fixture `scripts/verify-desktop.mjs --filter-output` |
| TypeSafe feature smoke | Nine scenarios passed, 11 actual calls, input 6,781 / output 1,278 tokens, request latency sum 6,503 ms | [live-smoke.json](live-smoke.json) |
| Actual Chrome engine | One real Jev selection followed by browser click and independent DOM verification; this was headless Chrome, not the user's extension | [browser-live.json](browser-live.json) |
| Actual Computer Use plugin | Real Jev selected digit 7; fresh observation, one-use ticket, native plugin click; calculator AX value became 7 | [host-drivers.json](host-drivers.json) |
| Five-language dashboard | All languages render, no desktop/mobile overflow, no browser JS errors | [dashboard.json](dashboard.json), [screenshot](dashboard-zh-CN.png) |
| macOS lifecycle | Activate → update preserving activation → disable; prior launch override and launch agent restored | [installer-macos.json](installer-macos.json) |
| Portable OS CI | 55 tests per OS pass on macOS, Windows and Linux; native build and package pass at revision `423ff171` | [CI record](ci.json), [run](https://github.com/wangzhezbz/jev-pilot/actions/runs/35630157460) |

The four live sets above total **14 TypeSafe calls**, **8,868 input tokens**, **1,534 output tokens**, and **8,236 ms summed API request latency**. Calls were synthetic or on our own test UI. No real GPT performance A/B was run in this implementation pass. Native engine fixtures use a synthetic inference endpoint: their usage counters are fixture data, not billable GPT consumption. Summed API latency is not total development time or a savings measurement.

## Release gates still open

- **Chrome extension:** discovery works but session/tab control repeatedly times out in the available host. A working headless browser and working Computer Use do not certify that extension connection. The coordinator code exists; extension acceptance is blocked on this external channel.
- **Windows/Linux desktop:** portable tests, native launcher execution and package builds are covered by CI. Actual Codex desktop launch, environment adoption, effort update and rollback need those clients/devices. No macOS result substitutes for that.
- **Consumer distribution:** development packages include a native launcher; Node 24+, curl and rg are prerequisites. Public signed one-click installers are not released.
- **Native context:** handoff is reversible selection, not replacement of existing Codex conversation history. Automatic eligible tool-output filtering is separately verified.
- **Savings:** no stable time/token/account-quota percentage is claimed. A matched real workload A/B with quality acceptance is needed.

The currently running desktop process is not replaced by installer preparation. A configured adapter takes effect on a subsequent normal launch; per-task logs must then confirm its actual version and receipts.
