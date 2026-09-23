<p align="center"><img src="assets/hero.en.2f6ccfcbe0bf.svg" width="100%" alt="JevPilot" /></p>

<p align="center">
  <a href="#availability"><img src="assets/windows.svg" width="32%" alt="Windows — Preview · See status" /></a>
  <a href="#availability"><img src="assets/macos.svg" width="32%" alt="macOS — Preview · See status" /></a>
  <a href="#availability"><img src="assets/linux.svg" width="32%" alt="Linux — Preview · See status" /></a>
</p>

<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**One plugin for your usual Codex workflow.**

Runnable development preview. All 14 modules share one MCP entry point, one implicit skill and a desktop adapter. Codex plans, implements and verifies; Jev handles bounded decisions.

## Capabilities

| # | Feature | Description |
| :--- | :--- | :--- |
| 1 | **Automatic judgments** | Batch bounded choices, cache repeated decisions and fall back to Codex. |
| 2 | **Actual effort routing** | Change real request effort, retain the selected model and record native receipts. |
| 3 | **Search and file screening** | Rank source-linked candidates and show omitted evidence. |
| 4 | **Recoverable output filtering** | Retain useful passages; saved originals remain available. |
| 5 | **Tool and skill selection** | Shortlist relevant tools while preserving required and uncertain candidates. |
| 6 | **Failure recovery** | Classify observed failures and stop repeated ineffective actions. |
| 7 | **Evidence and quality checks** | Check real execution receipts, current sources, content rules and translations. |
| 8 | **Chrome and Computer Use** | Coordinate existing drivers with fresh observations, one-use tickets and independent verification. |
| 9 | **Project memory** | Opt-in, source-backed memory with expiry, conflict handling and revocation. |
| 10 | **Real metrics** | Separate Jev overhead, native usage and actual effort changes. |
| 11 | **Context handoff** | Create recoverable compact handoffs; preserve constraints and unfinished work. |
| 12 | **Change review and tests** | Triage changes and prioritize tests without dropping mandatory checks. |
| 13 | **Checkpoints and resume** | Save milestones and revalidate files before continuing. |
| 14 | **Exact-source extraction** | Extract original spans; report missing and ambiguous fields. |

<a id="availability"></a>

## Availability and use

Node 24+, curl and rg are required for this preview. Install the plugin once, configure your own TypeSafe key locally, and let Codex handle setup. Ordinary tasks need no extra trigger or separate runner. See the [setup guide](docs/FEATURES.md).

Portable tests pass on macOS, Windows and Linux. Native macOS engine routing and Computer Use were exercised. Windows/Linux desktop sessions still need device acceptance. The real Chrome extension now passes Jev selection, a single click and independent page verification with TUN off. Plugin proxy inheritance is repaired without modifying Codex binaries. Public signed installers are not released.

## Evidence and limits

Recoverable context handoff does not replace native conversation history or reclaim existing tokens. No universal speed, token or quota savings are claimed. See the [acceptance report](docs/reports/ACCEPTANCE.md), [feature boundaries](docs/FEATURES.md) and [roadmap](docs/ROADMAP.md).

Latest measurements: the [2026-09-23 functional and performance report](docs/reports/validation-20260923/README.md) includes real calls, failures, per-run tokens, timing and reproducible fixtures. Smaller tool output does not necessarily reduce whole-task usage.

JevPilot is licensed under [MIT](LICENSE). Independent community project, not an official OpenAI or TypeSafe product.
