# Install the development preview

This is one Codex plugin. It bundles its own skill, MCP server and removable desktop adapter; users do not need to download the upstream projects separately.

## Ordinary Codex users

Open a normal Codex task and ask:

> Install JevPilot from https://github.com/wangzhezbz/jev-pilot, branch codex/jev-pilot-integration, as one personal plugin. Check prerequisites, configure the removable desktop adapter, and verify the installation. Keep my existing model and normal conversation workflow. Open the local setup page so I can enter my own TypeSafe key privately.

The agent performs the one-time work below. After setup and a normal desktop restart, keep giving normal tasks. Semantic assistance is dispatched by the implicit skill; effort routing and eligible tool-output filtering run in the desktop bridge. The tool registry in an already-open task may need a new task to discover newly installed MCP tools.

Never paste a key into a public issue, repository or shell argument. The local dashboard accepts it privately. Access to TypeSafe must already be granted to that user's account.

## Agent / developer procedure

1. Check Node 24+, `curl`, `rg` and the installed Codex runtime. The currently verified wire version is `codex-cli 0.155.0-alpha.9.2`. Preserve ordinary Codex behavior on other versions.
2. Obtain the repository at a fixed revision. If building from source, Go is also needed to build the native launcher. CI development archives include a launcher for their build platform and do not require consumer-side Go.
3. Use Codex's bundled **plugin-creator** skill to register this folder as `jev-pilot` in the user's personal marketplace. Follow that skill's helper-based registration and validation flow; do not replace the user's marketplace or other plugins. The repository has both portable and Codex compatibility manifests.
4. Install `jev-pilot@personal` with Codex's plugin command. Check actual native MCP discovery: the `jev_pilot` tool must be present, not merely a manifest on disk.
5. Run `node scripts/cli.mjs dashboard` from the plugin and open its returned localhost URL. Let the user enter their own key. The agent should not print the key or include it in commands.
6. Run `node scripts/cli.mjs setup --activate` once. This installs the private adapter and configures the next launch. Do not patch the app bundle. Report any missing dependency or unknown client version rather than claiming installation succeeded.
7. After a normal app restart, run `doctor` and inspect fresh `desktop_metrics`. Distinguish installed, configured for next launch, active bridge and actual per-task applied effort. A previous process's log is not proof of this task.

The steps are agent-side setup, not commands the user must repeat per task. One-time plugin trust and credentials follow the host's normal controls.

## Disable / recover

`node scripts/cli.mjs disable` restores the previous launcher override and preserves data. A normal app restart removes the adapter from future sessions. `enable` restores it. The local dashboard can disable assistance for one project; project memory is off by default and needs user authorization.

Updates preserve installation metadata and keep backups. Unknown runtime versions, damaged adapter files and unavailable Jev retain ordinary Codex execution. See [acceptance](reports/ACCEPTANCE.md) before claiming platform support.

Public signed consumer installers are not yet released. Windows/Linux portable CI is complete; real desktop acceptance remains a release gate. Existing Chrome and Computer Use plugins provide their own runtime permissions and connections; JevPilot does not install a second browser extension.
