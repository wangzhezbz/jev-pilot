<p align="center"><img src="assets/hero.en.2f6ccfcbe0bf.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.svg?v=preview20260926" width="32%" alt="windows x64 — Download preview" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.svg?v=preview20260926" width="32%" alt="macos arm64 — Download preview" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.svg?v=preview20260926" width="32%" alt="linux x64 — Download preview" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**One plugin. Your usual Codex workflow. Let Jev handle bounded decisions while Codex plans, builds and verifies.**

[Other architectures and checksums](https://github.com/wangzhezbz/jev-pilot/releases/tag/preview-20260926) · [macOS Intel](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-x64.zip) · [Windows ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-arm64.zip) · [Linux ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-arm64.zip)

macOS desktop tested · Windows/Linux preview: builds and CI verified, desktop validation pending. Unsigned ZIPs; Node 24+, curl and ripgrep required.

## How it works

Describe the task as usual. JevPilot assists with suitable decisions, evidence and UI steps; Codex remains responsible for complex reasoning and final verification. No extra component skills, separate task runner or repeated trigger phrase.

## Measured examples

| Scenario | Time | GPT tokens | Estimated cost including Jev |
|---|---:|---:|---:|
| Document review | −40.03% | −23.88% | −33.69% |
| Computer Use navigation | −47.64% | −57.14% | −56.52% |

Selected measured examples, two pairs per scenario on macOS. UI figures cover the operation window in a long conversation; costs use the 2026-09-24 API-equivalent price snapshot. These are scenario-specific observations, not guaranteed savings. [Data & methodology](docs/reports/targeted-20260925/README.zh-CN.md) · [All reports](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

## 14 capabilities

| # | Capability | What it does |
|---:|---|---|
| 1 | **Automatic judgments** | Batch classification, choices and reusable decisions. |
| 2 | **Adaptive reasoning effort** | Adjust actual request effort while keeping your model. |
| 3 | **Search and file screening** | Find relevant candidates with source locations. |
| 4 | **Recoverable output filtering** | Read useful evidence first and recall the original. |
| 5 | **Tool and skill selection** | Keep required tools and select relevant options. |
| 6 | **Failure recognition and recovery** | Bound retries and hand uncertain work back to Codex. |
| 7 | **Evidence and quality checks** | Check execution receipts, rules and translations. |
| 8 | **Chrome and Computer Use** | Delegate scoped multi-step clicks through existing host plugins. |
| 9 | **Project memory** | Opt-in memory with sources, expiry and revocation. |
| 10 | **Usage and effects** | Track GPT/Jev usage, cost estimates and actual effort changes. |
| 11 | **Context handoffs** | Prepare recoverable, lossless shared-text handoffs. |
| 12 | **Change review and test selection** | Prioritize changes while retaining mandatory tests. |
| 13 | **Checkpoints and resume** | Save progress and revalidate changed files before continuing. |
| 14 | **Exact-source extraction** | Return original spans; mark missing or ambiguous fields. |

## Install once, then work normally

1. Download and extract the ZIP for your OS and CPU.
2. Open Codex and send the installation request below. Codex checks dependencies and installs the plugin.
3. Enter your own TypeSafe key privately on the local setup page, then restart Codex normally.
4. Continue asking for work as usual. Chrome/Computer Use features use their existing official plugins.

> Install JevPilot from this extracted folder as a personal Codex plugin. Check dependencies and runtime compatibility, open the local page for me to enter my TypeSafe key privately, configure the desktop adapter, and verify it after restart. Preserve my selected model and other plugins.

### Install from GitHub

> Install JevPilot from https://github.com/wangzhezbz/jev-pilot as one personal Codex plugin. Check dependencies and compatibility, guide private TypeSafe key setup, and verify activation after restart.

[Installation details](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## Project status

Development preview · MIT · English / 简体中文 / Русский / 日本語 / 한국어. Project memory is opt-in. Context handoffs do not rewrite native conversation history. Independent community project; not an official OpenAI or TypeSafe product.
