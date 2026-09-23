# Frozen JevPilot v16 A/B after restart

[Full Chinese report](README.zh-CN.md) · [Runs CSV](runs.csv) · [Raw evidence](runs.json)

GPT-6 Astra, initially high. Three tasks × two repeats × bare/combined = 12 real tasks, AB/BA balanced by task, sequential. Quality: 12/12 accepted.

Observed combined-versus-bare change: task time +4.87%; GPT total tokens +13.88%; known GPT+Jev tokens +20.39%; uncached GPT input +5.70%. These are small-sample backend observations, not desktop UI latency, billed quota or guaranteed savings.

Jev calls: 26; input/output: 46869/2756; unknown-usage calls: 0. Real changes: 0 at turn start, 0 native mid-turn applied. All individual outcomes, including regressions, are retained.
