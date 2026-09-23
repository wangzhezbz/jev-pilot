# Cache-preserving effort updates and routing budget follow-up

See the [full Chinese report](README.zh-CN.md), [per-run CSV](runs.csv), [accounting](accounting.json), [native wire checks](adapter-default-wire.json), and [raw observations](cache-runs.json).

Native Codex 0.155.0-alpha.16.3 can append effort configuration updates while retaining the original top-level effort. Six model variants passed native transport and real task acceptance; GPT-6 Sol passed compaction and continuation. Repeated unchanged baseline decisions now reuse one extra tool boundary without extending automatic downgrades or suppressing failures/new input.

One GPT-6 Sol observation reduced uncached input from 22,228 to 7,305 tokens. This is not a 67% reduction in total tokens or account quota. GPT-5.6 Sol had a later cache miss and worse task-level uncached input. The natural semantic task still showed an overhead counterexample: 185,182 versus 263,335 GPT tokens, with no Jev API call because all fixed-size chunks were protected. This limitation remains open.

An invalid four-task protocol pilot omitted judgment confidence and was excluded; its spend is retained. Its shutdown defect caused overlap with part of the diagnostics, invalidating latency comparisons. This is a mechanism/compatibility report, not a demonstrated overall speed or billing improvement.

A follow-up natural run exposed a separate host approval blocker for the mixed read/write `jev_pilot select` tool. Selection now also uses the read-only `jev_evidence` entry. Native code-mode acceptance under `approvalPolicy:never` passed. A real Jev component check retained all 8 target cases, excluded 116 of 180 records, and restored the exact original; 6 calls took 4.119 seconds. Reduced context bytes are not GPT-token or end-to-end savings. Natural adoption after this fix still needs repeated validation.
