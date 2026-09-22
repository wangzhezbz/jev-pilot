# Chrome command failure: network initialization evidence

Date: 2026-09-22. This is a diagnosis, not a successful repair receipt.

## Observations

- Chrome native messaging is registered and its host is running. OS socket inspection shows the active browser tool process connected to that host. This rules out a completely absent native-host connection for the observed attempt.
- The documented `nameSession` call now fails immediately with a fetch failure; previous attempts timed out. It still happens before any requested webpage operation.
- The installed official browser service initializes caller identity by fetching the ChatGPT `/backend-api/aura/identity` endpoint. Source inspection was limited to connection/initialization implementation after the documented API and troubleshooting route failed; no code or permission checks were modified.
- macOS has a user-configured local HTTP/HTTPS proxy. The actual `cua-repl` and `node_repl` processes have no proxy environment variables. The generated `cua_repl` MCP manifest has an empty `env_vars` list and no explicit proxy environment values. The main Codex backend does have proxy variables, so its connectivity does not establish connectivity of the browser tool process.
- An unauthenticated transport-only comparison against the same official identity endpoint gave: direct connection timed out after 5.006 seconds, HTTP status 000; existing system proxy returned HTTP 403 after 0.364 seconds, completing TLS. No account token was read or supplied. HTTP 403 demonstrates reachability only; it is not a successful identity check.

## Interpretation and remaining validation

Missing proxy propagation to the browser automation process is a concrete configuration mismatch and the strongest current explanation for the initialization fetch failure. The endpoint dependency, process environment and direct/proxy transport difference align. Exact causality still requires a supported proxy configuration for this MCP process, reload and a successful authenticated initialization followed by a real Chrome command.

Do not disable identity, site-status, approval or other permission checks to work around this error. Do not silently patch the official browser service. Editing only a generated plugin cache is not a durable repair because desktop reconciliation can recreate it. The separate Brave registration EPERM warning remains an independent lead, not established as the Chrome root cause.

Official troubleshooting also recommends a fresh chat to clear chat-specific connection state and restarting/reinstalling through normal app controls when needed: https://learn.chatgpt.com/docs/chrome-extension

No browser permissions, proxy settings, account credentials or official runtime source were modified during this diagnosis.

## Follow-up: TUN recovery and root-cause isolation

After the user enabled v2rayN TUN, the same documented Chrome session API succeeded. The agent opened `https://example.com/`, read its accessibility tree, clicked the visible Learn more link, and verified the resulting `https://www.iana.org/help/example-domains` page. This verifies recovery under TUN, not a repair of explicit proxy forwarding.

The subsequent investigation distinguished two process boundaries:

1. The main Codex backend has proxy environment variables. Its `cua-repl` child and that child's `node_repl` process have none. The installed app-managed `unified-computer-use` manifest has `env_vars: []` and no explicit proxy values in `env`.
2. The Jev bootstrap adds the macOS system proxy to its own environment, but `runtime/desktop/bridge.mjs` removes the added HTTP_PROXY/HTTPS_PROXY/NO_PROXY values from its backend child. This is a separate propagation limitation. Removing that deletion alone cannot fix the first boundary: the actual browser tool process is already below a parent that has proxy variables.

A controlled local experiment bypassed Jev entirely, using the bundled stock Codex executable and an isolated CODEX_HOME. A synthetic MCP server recorded only proxy environment variable names. No credentials were copied, no model turn was started, and paid model calls were zero:

| Stock Codex MCP configuration | Proxy names received by the child |
| --- | --- |
| `env_vars = []` | none |
| `env_vars = ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"]` | all three |

This reproduces proxy loss without Jev and identifies the missing MCP forwarding configuration as the current explicit-proxy failure mechanism. It does not establish when that configuration or browser networking implementation changed. Historical success without TUN is compatible with a different process/configuration/network path; no verified before/after version pair is available.

Configuration-only probes also established that adding only `mcp_servers.cua_repl.env_vars` is rejected as an incomplete transport, while adding `plugins."unified-computer-use@openai-bundled".mcp_servers.cua_repl.env_vars` is silently ineffective in the inspected effective transport. A complete top-level MCP definition accepts proxy values, but a partial recreation loses other original settings (for example the enabled tool list). It must not be installed as-is. Any durable adaptation must preserve the original command, arguments, tool policies, environment, and app-managed updates.

Remaining acceptance: user disables TUN while retaining the existing system proxy; a correctly configured, freshly started browser tool must initialize and perform a real navigation and click without TUN. No permanent MCP override or runtime source patch has been installed in this follow-up.

## Repair staged after TUN was disabled

The user confirmed TUN was disabled. After resetting the browser JavaScript kernel, a new Chrome binding was obtained, but `nameSession` timed out after 30 seconds. This is a fresh failure without TUN, not reuse of the successful TUN session.

- Removed the bridge's deletion of system-proxy variables. The backend still receives neither the TypeSafe credential nor the recursive CLI override. A real child-process regression test verifies these properties.
- All 68 tests and the package syntax/JSON/secret checks passed. The updated adapter was installed through its existing setup command without restarting the running desktop.
- Added a backed-up, local `mcp_servers.cua_repl` compatibility definition to the user's Codex configuration. It copies every field from the installed app-managed definition and only extends `env_vars` with the eight standard upper/lowercase HTTP, HTTPS, ALL and NO proxy names. No proxy values, tokens, or passwords were added to this definition.
- A configuration-only before/after probe verified that all fields exposed by `codex mcp get cua_repl --json` are identical except `transport.env_vars`. Original tool limits and omitted tool surfaces are also retained in the copied definition. The original plugin had no custom per-tool overrides.
- This local compatibility definition is scoped to desktop build `26.915.31945`. It is not a general release fix and must be reviewed/refreshed after desktop updates because a top-level definition shadows the generated plugin definition. No official plugin code or cache file was modified.

Actual no-TUN Chrome acceptance remains pending a desktop restart: the existing MCP process cannot receive new environment variables retroactively. Keep TUN off during that acceptance. A successful configuration read or passing unit test is not a successful browser interaction.

## Restart result and user constraint

The next desktop restart did NOT resolve Chrome initialization. A fresh `nameSession` timed out. New `cua-repl` and `node_repl` processes still lacked proxy variables. The top-level `mcp_servers.cua_repl` definition was absent from config.toml after restart, and the effective allowlist was again empty. The exact writer that removed the definition was not identified.

A version-hash-guarded startup-argument workaround was prepared and unit tested (69 tests passed), but it has NOT been accepted as a desktop browser repair. The user then requested addressing plugin VPN networking rather than modifying Codex startup behavior. The installed `browserProxyCompatibility` option was removed before desktop activation. Do not re-enable that workaround or request another restart for it without addressing the user's constraint. The optional code remains staged locally and defaults to disabled. No official Codex binaries or browser-plugin code were edited.

Current distinction: Chrome's browser networking and the companion MCP process's identity/authorization networking are separate. The observed failure is in the companion's initialization fetch; adding proxy forwarding at the supported plugin boundary is the desired repair surface. Successful Chrome page loading alone does not prove that companion request uses the system proxy. No no-TUN browser acceptance has passed.

## Plugin-boundary repair attempt

Following the user's request to continue at the plugin layer, the installed `unified-computer-use` `.mcp.json` was backed up outside the plugin cache and changed only by adding the eight standard proxy variable names to `cua_repl.env_vars`. No proxy values or credentials were written. Codex binaries, CLI launch arguments, and plugin JavaScript code were not changed for this attempt.

A fresh stock Codex app-server, with unrelated plugins disabled only for that disposable process, started the real installed `cua-repl` command. OS process inspection confirmed all eight proxy variable names reached that fresh process. No model turn or browser UI operation was run through this diagnostic process. Evidence: `browser-proxy-process-probe.json`. This verifies actual environment propagation, not successful Chrome interaction. The existing task's MCP process remains old and does not acquire changed environment variables dynamically.

The earlier startup-argument workaround was removed from source and the local installation was refreshed. The retained Jev bridge fix only preserves the existing proxy environment for its backend child. The user was asked to disable/re-enable the browser plugin so its actual runtime can be reloaded without another desktop restart. After that, first check whether app reconciliation preserved the plugin manifest change, then verify Chrome using the supported CUA tool. The app-managed manifest may be regenerated; this local change is not yet a durable product fix.

## Accepted local recovery after plugin reload

The user confirmed the browser plugin was re-enabled while keeping TUN disabled. The manifest retained the proxy allowlist. Real desktop child processes 6615/6616 and other newly started CUA instances contained all eight proxy variable names; the existing desktop backend remained PID 96757.

The supported `mcp__cua_repl` tool then completed the actual Chrome workflow:

- `nameSession`: success, tool wall time 0.3153 s.
- Open `https://example.com/`: success; returned Example Domain title and accessibility content, 0.7641 s.
- Click the visible Learn more link and read updated state: success; verified `https://www.iana.org/help/example-domains`, Example Domains heading and page content, 0.9526 s.

These are individual tool wall times, not a performance benchmark. This verifies local Chrome recovery without TUN after repairing the companion plugin's proxy forwarding and reloading it. The successful change is the plugin `.mcp.json` environment allowlist; no Codex binary edit or startup override was used. Durability across desktop/plugin upgrades remains unverified because the app manages this cache file. This is a local verified repair, not a shipped cross-platform JevPilot feature.
