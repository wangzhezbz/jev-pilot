# Install the development preview

This is one Codex plugin. It bundles its own skill, MCP server and removable desktop adapter; users do not need to download additional component projects separately.

## Ordinary Codex users

Open a normal Codex task and ask:

> Install JevPilot from https://github.com/wangzhezbz/jev-pilot, latest preview release, as one personal plugin. Check prerequisites, configure the removable desktop adapter, and verify the installation. Keep my existing model and normal conversation workflow. Open the local setup page so I can enter my own TypeSafe key privately.

The agent performs the one-time work below. After setup and a normal desktop restart, keep giving normal tasks. Semantic assistance is dispatched by the implicit skill; effort routing and eligible tool-output filtering run in the desktop bridge. The tool registry in an already-open task may need a new task to discover newly installed MCP tools.

Never paste a key into a public issue, repository or shell argument. The local dashboard accepts it privately. Access to TypeSafe must already be granted to that user's account.

## Agent / developer procedure

1. Check Node 24+, `curl`, `rg` and the installed Codex runtime. Verified wire versions are `codex-cli 0.155.0-alpha.9.2`, `0.155.0-alpha.16.3` and `0.155.0-alpha.16.4`. Preserve ordinary Codex behavior on other versions.
2. Obtain the repository at a fixed revision. If building from source, Go is also needed to build the native launcher. CI development archives include a launcher for their build platform and do not require consumer-side Go.
3. Use Codex's bundled **plugin-creator** skill to register this folder as `jev-pilot` in the user's personal marketplace. Follow that skill's helper-based registration and validation flow; do not replace the user's marketplace or other plugins. The repository has both portable and Codex compatibility manifests.
4. Install `jev-pilot@personal` with Codex's plugin command. Check actual native MCP discovery: the `jev_pilot` tool must be present, not merely a manifest on disk.
5. Run `node scripts/cli.mjs dashboard` from the plugin and open its returned localhost URL. Let the user enter their own key. The agent should not print the key or include it in commands.
6. Use the dashboard's preparation/update button after its prerequisite checks pass, or run `node scripts/cli.mjs setup --activate` once. This installs the private adapter and configures the next launch. Do not patch the app bundle. Report any missing dependency or unknown client version rather than claiming installation succeeded.
7. After a normal app restart, run `doctor` and inspect fresh `desktop_metrics`. Distinguish installed, configured for next launch, active bridge and actual per-task applied effort. A previous process's log is not proof of this task.

The steps are agent-side setup, not commands the user must repeat per task. One-time plugin trust and credentials follow the host's normal controls.

## Disable / recover

`node scripts/cli.mjs disable` restores the previous launcher override and preserves data. A normal app restart removes the adapter from future sessions. `enable` restores it. The local dashboard can disable assistance for one project; project memory is off by default and needs user authorization.

Updates preserve installation metadata and keep backups. Unknown runtime versions, damaged adapter files and unavailable Jev retain ordinary Codex execution. See [acceptance](reports/ACCEPTANCE.md) before claiming platform support.

Setup checks Node, curl and ripgrep before modifying the adapter. Once the updated bridge has loaded, adding or replacing a key in the private setup page is picked up at the next Jev routing decision without another restart. An explicitly supplied process environment key takes precedence over the private file.

Public signed consumer installers are not yet released. Windows/Linux portable CI is complete; real desktop acceptance remains a release gate. Existing Chrome and Computer Use plugins provide their own runtime permissions and connections; JevPilot does not install a second browser extension.

`installation_plan` reports prerequisites without installing anything. `compatibility_probe` performs isolated native hook discovery after a Codex upgrade; a successful probe alone never enables an unknown version. The dashboard task timeline uses new project-scoped logs after v8 loads and excludes older unscoped records. Automatic checkpoints can be inspected with `checkpoint` / `action: latest` using the real task ID and always require current-state review.

## Browser proxy compatibility

For the existing official Chrome/Computer Use plugin, JevPilot checks proxy-variable inheritance during setup, MCP startup and `status`/`browser_step`. Only the eight standard proxy variable names are added to the known plugin manifest allowlist. Values, permissions, identity checks and official application files remain unchanged. The existing parent must already have working proxy settings; this does not install or configure a VPN.

`browser_network` (or `node scripts/cli.mjs browser-network`) reports readiness; `{"repair":true}` (CLI `--repair`) requests the same bounded repair. Original manifest bytes are kept in the private `browser-network-backups` directory. Generated manifests can be repaired again after updates; unsupported layouts are reported and left intact. Set `JEV_PILOT_BROWSER_PROXY_REPAIR=0` to disable automatic repair. If a Chrome child was already running without the proxy, a normal plugin reload is still necessary. Never terminate an active user workflow to apply it.

The Node configuration planner also handles single-line TOML literal strings and the reported Windows `OpenAI.Codex_<version>_x64/arm64[_Green]/app/resources/cua_node/bin/node_repl.exe` layout. It requires the sibling `node.exe` and a supported Node version; unknown layouts and explicit proxy disable settings remain untouched. This repairs configuration for future processes only. It does not establish that a running Chrome host has received or uses a proxy, nor that `tabs.list()` succeeds. Windows Window2 Computer Use requires a selected `window` object; see the plugin's browser reference for its bounded AX and calculator-key paths.
