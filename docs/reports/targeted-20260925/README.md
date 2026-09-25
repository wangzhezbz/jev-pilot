# Evidence and Computer Use regression follow-up

[Full Chinese report](README.zh-CN.md) · [Observed data](summary.json) · [Previous negative results](../holdout-20260925/README.md)

Release candidate `0.2.0+codex.20260925205500` improves lossless prose presentation and adds a strict AX web-subtree scope helper. It preserves original recall, source identities, semantic selection, effort routing, permissions, and native fallback.

| Two AB/BA pairs per population | Time | GPT tokens | Estimated cost including Jev |
|---|---:|---:|---:|
| Independent native document tasks | −40.03% | −23.88% | −33.69% |
| Computer Use observation-to-verification windows | −47.64% | −57.14% | −56.52% |

All eight final results passed verification. Both delegated UI runs completed five actual Jev-guided actions without a handoff. Document tests include one real high→low applied receipt. The complete serialized representation of the same 90-record source fell from 17,653 to 4,641 bytes; all IDs and exact recall were retained, with no paid compression call. Local regression: 373 tests; reversible-text audit: 160 cases.

These are known optimization fixtures, not a fresh holdout. UI runs share a long, mostly cached Astra conversation and exclude initialization; they must not be pooled with independent native tasks or extrapolated to short conversations. Costs use the repository's 2026-09-24 snapshot, not observed subscription debits. Cache/provider latency causality remains unresolved.

A separate Chrome smoke check hit automatic translation of allowlisted labels and completed through native fallback. It is **not** an autonomous Chrome acceptance or new speed claim. The full report retains its receipts and this remaining limitation.

The measured core was installed and file hashes verified. At installation audit, the desktop still held the old runtime fingerprint; a normal Codex restart is required before claiming ordinary tasks loaded the new revision. No Windows/Linux real UI claim is made.
