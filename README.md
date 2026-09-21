<p align="center">
  <img src="assets/hero.en.2f6ccfcbe0bf.svg" width="100%" alt="JevPilot — When Codex meets Jev. Feel like flying." />
</p>

<p align="center">
  <a href="#availability"><img src="assets/windows.svg" width="32%" alt="Windows — planned; no installer yet" /></a>
  <a href="#availability"><img src="assets/macos.svg" width="32%" alt="macOS — planned; no installer yet" /></a>
  <a href="#availability"><img src="assets/linux.svg" width="32%" alt="Linux — planned; no installer yet" /></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>
<p align="center">
  <a href="#the-idea">The idea</a> · <a href="#planned-capabilities">Capabilities</a> · <a href="docs/ROADMAP.md">Roadmap</a> · <a href="https://github.com/wangzhezbz/jev-pilot/releases">Releases</a> · <a href="LICENSE">MIT license</a>
</p>

# JevPilot

**One Jev plugin. Your usual Codex workflow.**

JevPilot is building a single home for Jev-powered assistance in Codex: choosing reasoning effort, filtering relevant context, and helping recover from failed steps. The goal is to install once, connect your TypeSafe account, and keep working in the same conversation.

**Development preview:** runnable code, a unified plugin and tests for all 14 feature areas are now present. Cross-platform desktop acceptance is still in progress. See the [full feature matrix and verification boundaries](docs/FEATURES.md).

## The idea

You describe the task. Codex handles planning, implementation, and final verification. Jev handles small, bounded decisions along the way.

<p align="center">
  <img src="assets/workflow.svg" width="100%" alt="Planned workflow: you ask Codex as usual; Codex plans, builds and verifies; JevPilot assists with effort routing, context filtering and failure triage." />
</p>

For example, when you ask Codex to investigate a bug, JevPilot is intended to shortlist useful search results, retain relevant log passages, and help distinguish a temporary network failure from a code error. Codex still reads the evidence, makes the changes, and checks the result.

## Planned capabilities

| Capability | What it is designed to do |
| :--- | :--- |
| **Adaptive reasoning** | Select effort for the current step and report whether the runtime actually applied it. |
| **Relevant context** | Rank search results and candidate files before deeper reading. |
| **Recoverable filtering** | Trim large tool outputs while keeping the originals available for recall. |
| **Failure recovery** | Classify failures and help avoid repeating an ineffective action. |
| **Completion evidence** | Compare completion claims with task-appropriate checks and their recorded outcomes. |
| **Browser assistance** | Carry out bounded browser steps, then return control to Codex for verification. |
| **Visible results** | Show real Jev calls, applied changes, latency, and available token usage. |

These modules will be delivered incrementally through one installation. There should be no collection of skills for users to manage and no special phrase needed for each task.

## Availability

| Target platform | Public package | Integration status |
| :--- | :--- | :--- |
| Windows | Not released | Planned; validation pending |
| macOS | Not released | Planned; validation pending |
| Linux | Not released | Planned; validation pending |

The cross-platform goal is shared. Actual support will be documented per operating system, Codex client, and version after testing; the platform cards are not a claim of current desktop-client availability. They lead here until tested packages exist.

When a build is ready, its download and tested compatibility will appear in [Releases](https://github.com/wangzhezbz/jev-pilot/releases). Developer setup and the ordinary-user plugin flow are described in the [feature guide](docs/FEATURES.md).

## What we will measure

- **Time:** end-to-end task duration, including routing overhead and retries.
- **Usage:** available input, cached-input, output, and reasoning token counts, with Jev usage recorded separately.
- **Quality:** task acceptance, missed evidence, recalls, and rework.
- **Actual behavior:** recommendations and confirmed runtime changes reported separately.

Lower effort or smaller tool output does not by itself prove a faster task or lower account usage. We will publish results with the workload and measurement method, rather than promise a universal savings percentage.

## Development

The first milestone is a shared core with platform adapters, one setup flow, diagnostics, and a reliable fallback to normal Codex behavior. Retrieval filtering and failure recovery follow, then browser assistance.

See the [milestones and acceptance criteria](docs/ROADMAP.md). Have a concrete workflow to test? [Open an issue](https://github.com/wangzhezbz/jev-pilot/issues/new) with the task, operating system, and Codex version. Do not include API keys or private logs.

## License and attribution

JevPilot's original code and artwork are licensed under [MIT](LICENSE). Vendored code retains its original license and attribution; see [third-party notices](THIRD_PARTY_NOTICES.md).

JevPilot is an independent community project. It is not an official OpenAI or TypeSafe product. Jev is provided by [TypeSafe](https://typesafe.ai/).
