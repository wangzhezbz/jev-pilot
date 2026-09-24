# Evidence selection and handoff optimization

2026-09-24. This change improves a measured component; it does not establish end-to-end Codex token or latency savings.

- Run at most two independent evidence batches concurrently, with unchanged rubrics, thresholds, budgets and conservative failure handling.
- Put coverage and recovery instructions in the returned text so text-only consumers receive them.
- Remove repeated probability distributions from ordinary read-only display metadata, retaining provenance, decision categories and protection status. Advanced results remain detailed.
- Add local literal-query recall with explicit pagination; full recall remains available. No Jev call is needed for recall, and a literal miss does not prove semantic absence.

Four real Jev runs, old/new/new/old, used the existing 48-record development fixture with caching disabled. All four preserved every required/review record and passed exact recovery checks. Baseline: `60f3e595a456d014d5c3653d1eec3145c015b409`.

| Metric | Before, two runs | After, two runs |
|---|---:|---:|
| Mean selection time | 1,694.417 ms | 844.291 ms |
| Peak concurrent requests | 1 | 2 |
| Jev requests | 4 | 4 |
| Jev input tokens | 23,008 | 23,008 |
| Jev output tokens | 3,524 | 3,524 |

Observed component latency fell **50.17%** with equal Jev usage. Rendering both formats from each identical result reduced full wire bytes **19.76%–20.37%**. Bytes are not GPT tokens; the added coverage note increases context-only text. Neither reduced full-source rereading nor native savings has been demonstrated here.

There were no GPT calls, failed requests, unknown usage, discarded attempts or retries. Eight Jev calls used 46,016 input and 7,048 output tokens; the [official input price](https://docs.typesafe.ai/models) gives an estimate of $0.001932672, not a bill. Main-conversation development is outside this isolated trial.

235 local regressions passed, including a real MCP-server protocol test with no model calls. This is a small development regression, not held-out evaluation, desktop adoption acceptance, billing evidence or a latency guarantee. Main model, effort policy, evidence thresholds and acceptance rules are unchanged.

Plugin `0.2.0+codex.20260924150300` is installed and a fresh isolated native Codex host loaded both tools. Nine specified cached code/skill/manifest files match the repository. Existing observed desktop MCP processes still use the old version; current-conversation hot activation is not claimed. No forced restart or desktop-adapter change was made. The two plugin manifests are synchronized and the maintenance check now enforces that invariant. See [installation evidence](installation.json).

[Detailed Chinese report](README.zh-CN.md) · [All runs](results.json) · [CSV](runs.csv) · [Protocol](protocol.json) · [Summary](summary.json)
