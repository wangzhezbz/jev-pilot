<p align="center"><img src="assets/hero.en.2f6ccfcbe0bf.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.svg?v=download20260926" width="32%" alt="windows x64 — Download" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.svg?v=download20260926" width="32%" alt="macos arm64 — Download" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.svg?v=download20260926" width="32%" alt="linux x64 — Download" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**One plugin. Your usual Codex workflow. Let Jev handle bounded decisions while Codex plans, builds and verifies.**

## How it works

Describe the task as usual. JevPilot assists with suitable decisions, evidence and UI steps; Codex remains responsible for complex reasoning and final verification. No extra component skills, separate task runner or repeated trigger phrase.

## Measured examples

### Selected task comparisons

| Scenario | Time | GPT tokens | Estimated cost including Jev |
| --- | --- | --- | --- |
| [Document review](docs/reports/targeted-20260925/README.zh-CN.md) | −40.03% | −23.88% | −33.69% |
| [Ticket stable-sort fix](docs/reports/holdout-20260925/README.zh-CN.md) | −25.64% | −17.13% | −5.25% |
| [Interval-difference fix](docs/reports/holdout-20260925/README.zh-CN.md) | −14.20% | −12.58% | −31.40% |

### Browser and desktop operation windows

| Scenario | Time | GPT tokens | Estimated cost including Jev |
| --- | --- | --- | --- |
| [Chrome record lookup](docs/reports/holdout-20260925/README.zh-CN.md) | −41.03% | −55.91% | −54.87% |
| [Computer Use navigation](docs/reports/targeted-20260925/README.zh-CN.md) | −47.64% | −57.14% | −56.52% |

### Component measurements

| Component | Measured result |
| --- | --- |
| [Required-tool selection](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | All 12 tools retained; unnecessary Jev tokens: 2,090 → 0 |
| [Review and test selection](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | Versus the old version: time −22.69%, Jev tokens −53.93%; all 9 required tests retained |
| [Repeated handoff judgments](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | Across 5 handoffs, requests 5 → 1; Jev tokens −80.25%, original text retained |
| [Lossless context handoff](docs/reports/localization-handoff-20260925/README.zh-CN.md) | Serialized representation 5,439 → 2,713 bytes (−50.12%); all 6 exchanges recoverable |

These figures come from actual scenario tests. [Scenarios and full results](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

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

## Install from GitHub

Send this to Codex:

> Install JevPilot from https://github.com/wangzhezbz/jev-pilot as one personal Codex plugin. Check dependencies and compatibility, guide private TypeSafe key setup, and verify activation after restart.

[Installation details](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)
