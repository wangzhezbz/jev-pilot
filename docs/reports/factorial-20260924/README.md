# JevPilot: 12-run diagnostic experiment

2026-09-24, macOS, GPT-6 Sol, initially high. Native Codex `0.155.0-alpha.16.3`, plugin `0.2.0+codex.20260923233124`, routing policy v15.

**All 12 tasks passed independent acceptance, but stable speed or account-quota savings are not established.** Three synthetic tasks × four configurations, one observation per cell, sequential interleaved order. No forced Jev use or full log reads. The runtime policy was frozen throughout.

| Configuration | Passed | Task time | GPT tokens | Uncached input | Jev calls |
|---|---:|---:|---:|---:|---:|
| Native | 3/3 | 268.587s | 510,778 | 57,658 | 0 |
| Routing only | 3/3 | 240.690s | 471,447 | 82,165 | 13 |
| Evidence enabled | 3/3 | 235.981s | 474,522 | 77,979 | 0 |
| Routing + evidence | 3/3 | 251.513s | 414,247 | 96,769 | 15 |

Combined versus native: observed time −6.36%, GPT tokens −18.90%, **uncached input +67.83%**. There were two native-confirmed high→low changes, four budget-held recommendations, one superseded recommendation, and zero actual evidence-preparation/selection/recall calls. Enabling a feature is not evidence of adoption or savings.

The next measured generation after each actual switch had zero cached input. This is an association, not proof that effort changes invalidate the cache. The incident task was slower in both real-routing arms. Do not attribute aggregate improvements to routing or unused filtering.

Jev made 28 calls: 27 successful, one timeout with unknown usage. Known usage: 50,588 input / 2,862 output tokens. Known input cost estimate: $0.002124696 at the [official price](https://docs.typesafe.ai/models) checked on 2026-09-24; output is free. The unknown failed-call usage is not treated as zero. GPT billing and subscription-quota savings were not measured.

The native repository arm emitted one duplicate usage notification. Raw notifications are retained; accounting uses cumulative increments and does not double-count the duplicate 27,858-token entry. Native total usage for that arm is 204,779 tokens.

Tasks: cross-file concurrency/tenant-isolation repair; incident analysis with contradictory and distributed evidence; authoritative behavior localization in a 370-file synthetic repository. This is a native app-server experiment, not desktop UI latency or an end-to-end validation of all 14 modules. Setup and report-writing costs are outside the paired task measurements. One observation per cell cannot support significance or universal savings claims.

Next priorities: isolate cache behavior, preserve routing budget for later task phases without weakening safety checks, verify natural adoption and actual presentation of prepared evidence, then expand repetitions. No production runtime changes or restart required for this report.

[Detailed Chinese report](README.zh-CN.md) · [Per-run CSV](runs.csv) · [Generation usage](generations.csv) · [Protocol](protocol.json) · [Raw public evidence](runs.json) · [Summary](summary.json) · [Token accounting](token-decomposition.csv) · [Checksums](manifest.json)
