# Evidence operations

Call `jev_pilot` with `{workspace:absolute_directory, operation, input}`. All paths are inside that workspace; never send credential files. Candidate IDs are unique simple strings; rows are `{id,text,...}`.

| operation | input |
|---|---|
| select | `{goal,items,budget?:16000,against?:[already_read_text]}` |
| search | `{goal,query,paths?:['.'],maxMatches?:100,budget?}`; literal ripgrep candidates, then semantic selection |
| filter_output | `{goal,path,budget?}` or `{goal,text,source?,budget?,against?}` |
| recall | `{artifactId,ids?:[item_id]}` |
| extract | `{path,fields:[{id,description}]}` or `{content,fields}`; max 20k characters/16 fields |

Use native exact search first when concrete task terms suffice. Do not send a large source merely because it is large. Filtering is useful when many unresolved semantic candidates would otherwise need reading. The `budget` is UTF-8 bytes, not tokens. Do not inflate it just to conceal incomplete coverage.

Read evidence once from `context`; `items` contains provenance without duplicate text. `excludedIds` are judged exclusions; `deferredIds` are unexamined overflow, not irrelevant evidence. `completeCoverage:false`, degraded answers, or protected overflow require attention before exhaustive claims. Uncertain, contradictory, unfinished status metadata and failure evidence must stay available. Identical bodies at different source locations or observations remain distinct; text-only `against` applies only to plain-text candidates. Recall only missing items by `artifactId` and IDs; the full original is recoverable. Source offsets/hashes are provenance, not proof of conclusions. Exact extraction leaves missing or ambiguous values unresolved.

Exclusion requires the configured conservative probability threshold; it is not a calibrated accuracy guarantee. Errors fall back to Codex review. Native context or billing savings must be measured separately from byte reductions.
