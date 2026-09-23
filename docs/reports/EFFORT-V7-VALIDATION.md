# Stable routing budget and recoverable metadata — 2026-09-23

Policy: `effort-v7-stable-budget`. Plugin: `0.2.0+codex.20260923053541`.

## Problem and behavior

Live v6 logs contained two native high-to-medium publications followed by a baseline restoration only 96 ms and 69 ms later. These receipts do not prove that a model request used medium. Reserved judgments could introduce a fresh downgrade immediately before the budget fallback undid it.

The final ordinary judgment and the two reserved judgments now cannot introduce a new downgrade. Existing valid downgrade leases remain usable; reserved judgments can still raise effort when work becomes harder. Once a lease expires or is invalidated, budget exhaustion restores an automatic downgrade to the confirmed user baseline. Manual setting fences and the six-call limit are unchanged. This is deliberately more conservative in long turns, not evidence of greater token savings.

Transient model-list failures now retry on a later turn after a 5–60 second backoff. Concurrent callers share one request with a 1.5-second deadline; success stops retries and unsupported methods/parameters do not loop. A failure still leaves routing unavailable for that turn when model capabilities are unknown. New logs identify the bridge process and record typed metadata/transport failures, without response bodies, stderr or credentials. HTTP authentication, rate limiting, server errors and curl timeout/DNS/connection/TLS/proxy failures have distinct codes. Classification follows the official [curl error reference](https://curl.se/libcurl/c/libcurl-errors.html).

The five-language dashboard separates all-project routing from current-project evidence. It shows confirmed/unconfirmed restorations, blocked late downgrades, superseded/stale decisions, completed-turn budget skips/coalescing/lease reuse, recorded waiting, typed failures and metadata recovery. Historical unclassified failures stay unknown and equivalent display labels are combined. These counters do not measure savings.

## Validation

- **127 regressions passed**: budget-boundary behavior, reserved upward changes, manual setting races, metadata recovery/backoff/deduplication, shared and standalone transport failure classification, secret exclusion, and report separation including synthetic-event exclusion.
- Original bundled macOS engine `codex-cli 0.155.0-alpha.9.2`, synthetic model/evaluator endpoints: GPT-6 Astra, Sol and Luna each emitted `low, low, low, low, high, high, high, high`. Each scenario confirmed one baseline restoration and held two later downgrade recommendations. Models stayed unchanged. The equivalent v6 fixture restored twice and resumed low in between. This is a protocol comparison, not a real-task performance benchmark.
- Astra's serialized initial input prefix stayed preserved across requests; this does not measure cache hits. GPT-5.6 Sol manual setting scenario also passed, with outgoing low-to-medium requests.
- Two real Jev 1.13.0 calls passed, one through each transport, on synthetic fruit/tool classification. Total **640 input / 62 output tokens**; elapsed **1,302 ms / 580 ms**. **No paid GPT calls** and no quota retries. See [transport evidence](effort-v7-live-transport.json).
- Actual Chrome extension: English, Chinese, Russian, Japanese and Korean headings rendered; Chinese full-page layout inspected. Reload retained authorization, restored Chinese and populated runtime metrics. No browser console errors/warnings observed. The dashboard read the existing v6 runtime history during this check.
- Machine-readable native fixture evidence: [effort-v7-validation.json](effort-v7-validation.json).

## Delivery boundary

This update is installed and configured for the next normal desktop launch. Plugin manifest validation and original-host MCP tool discovery passed. Installed fingerprint: `345ec99601b6c20811164326581f2a925fe4cc1cf0414dd8f3db74404b1d7967`. The already-running desktop retains v6; installation and ordinary-session v7 activation are separate checks. No forced desktop restart is part of this update.

Full matched performance acceptance remains open after the earlier provider quota stop. This change does not establish stable speed, token or account-credit savings. Windows/Linux automated checks do not replace real-device acceptance. Dependency-bundled consumer installation and representative ordinary-task acceptance remain separate work.
