# Frozen v19 holdout evaluation — 2026-09-25

[Full report in Chinese](README.zh-CN.md) · [Machine-readable summary](summary.json)

Eight new native Astra code/document tasks and four real macOS UI episodes reached correct final results. No production policy edits, paid retries, discarded failures, or quota resets occurred during the evaluation. One Computer Use episode needed native final verification after an overly strict test scope callback rejected merged AX text.

| Population | Time change | GPT token change | Estimated cost change, including Jev |
|---|---:|---:|---:|
| Four independent native task pairs, pooled | +1.48% | −5.10% | +1.09% |
| Chrome observation-to-verification window | −41.03% | −55.91% | −54.87% |
| Computer Use / Safari window, including handoff | −4.34% | −44.62% | −41.34% |

The native suite had two actual effort changes, high→medium and high→low. Three task pairs were faster and cheaper; the eligibility-document pair was 109.54% slower and 116.49% more expensive. Its uncached input increased from 13,383 to 45,714 tokens. A 53.659-second public message-generation window accounts for most observed excess latency; provider/network causes are not observable. Jev judgment time was approximately 1.332 seconds.

UI data measures 21 actual native GPT generation records within one long-running task. Both UI arms use the same installed runtime; this compares native step-by-step UI control against Jev delegation, not an independent plugin-on/plugin-off task experiment. Setup and initial task construction are excluded from the timing window. Context is large and mostly cached, so token savings must not be extrapolated to short new tasks. The Chrome baseline landing page was auto-translated, another retained environmental difference.

Costs use the repository's 2026-09-24 price snapshot and standard API-equivalent rates. They are not subscription debits or observed invoices. Each case has one pair, all pages are synthetic/local, and no new Windows/Linux UI or other-model performance claim is made. These results do **not** establish stable savings across all workflows or full production acceptance of all 14 features.

The full report includes per-task costs, actual routing and Jev receipts, cache audits, quality checks, public event timelines, UI tool cells, limitations, and follow-up work. Local regression: 368 tests passed; production runtime unchanged.
