# Evidence operations

## Prepare before presentation

`jev_evidence` is a separate read-only tool. It accepts `investigate`, `prepare`, `select` and `recall`, with the usual `{workspace,operation,input}` envelope. Preparation accepts `{goal,value,source?,exact?,taskId?}` or `{goal,path,exact?,taskId?}` and returns `{value,selection}`. The `value` preserves the input envelope, exit code and metadata; only a supported text field may be shortened. Failed/unfinished commands, structured data, images, exact text, code files, small inputs, insufficient reduction, disabled Jev or judgment failure return the original. File permissions and private-path checks still apply. Jev receives eligible evidence under the existing credential and request budget.

## Investigate in one call

Use `{goal,queries,paths?,contextLines?:8,maxMatches?:200,budget?:16000}` before broad repository reads when several literal terms identify candidate material. Up to six case-insensitive queries run together. Text source snapshots are read once per call; overlapping surrounding-line windows are merged. Source coordinates and hashes remain attached. Small candidate sets or results that fit the display budget need no Jev request. Eligible large sets use at most two bounded requests under the existing guard. `selection:'local'` explicitly disables semantic selection for this operation.

This only searches rg-visible text files within the workspace, up to 400 files, 1 MB per file and 4 MB total. Private/outside paths are refused or skipped. Check `search.limited`, skipped counts, `deferredIds` and the text scope note. A window may omit context elsewhere in a file. Recall restores saved windows, even if files later change; native reads retrieve other context. This is not an exhaustive semantic survey. Use complete-source prepare/select when the task requires every relevant record. Never claim that no literal match proves no semantic match.

Repeated long prose lines may be displayed once with `[=S#]` references at every original occurrence. This is reversible presentation, not deletion or a semantic summary; code/JSON sources, exact requests and marker collisions bypass it. Original items and recall stay verbatim. Jev relevance questions, when admitted, each carry their own candidate with a shared rubric instead of the whole pool. Investigation allows at most two requests and respects the configured deadline, capped at five seconds. Other operations and desktop effort routing keep their existing profiles.

After semantic classification, all retained relevant and uncertain windows are returned. The display budget is a target, not permission to crowd known-relevant sources out with uncertain material; `protectedOverflow` reports any excess. The unclassified local fallback can defer windows but must disclose them and retain exact recall.

For a large, unresolved text result, call preparation inside the same `functions.exec` cell that obtains it. Resolve the actual installed tool name from `ALL_TOOLS`; do not hard-code a fixture name. Example after `rawResult` has been obtained with a normal authorized native tool:

```js
let display = rawResult;
const entry = ALL_TOOLS.find(t => /__jev_evidence$/.test(t.name));
if (entry) {
  try {
    const reply = await tools[entry.name]({workspace, operation: 'prepare', input: {goal, value: rawResult, source}});
    if (!reply.isError) {
      const prepared = reply.structuredContent ?? JSON.parse(reply.content[0].text);
      if (Object.hasOwn(prepared, 'value')) display = prepared.value;
    }
  } catch { /* Preserve the original; do not retry the command. */ }
}
text(display);
```

Keep `rawResult` for any in-cell parsing or computation. Do not apply this text-only example to images, video, structured browser state or exact code. Use normal native tools and permissions for execution; the evidence tool never executes commands. `selection.status:"prepared"` means a smaller presentation was returned, not that Codex consumed it or billing decreased. The returned text carries an artifact ID. Full `recall` restores the original envelope; selected `ids` return original source chunks.

For candidate records already available within a tool cell, use `jev_evidence` with `operation:"select"` and `{goal,items,budget?}`; emit the selected context without first printing all candidates. This calls the same selection implementation and preserves the artifact for recall. It does not require the mixed read/write tool's host approval.

## Existing evidence operations

Prefer `jev_evidence` for select and recall. Other operations remain available through `jev_pilot` with `{workspace:absolute_directory, operation, input}`. All paths are inside that workspace; never send credential files. Candidate IDs are unique simple strings; rows are `{id,text,...}`.

| operation | input |
|---|---|
| select | `{goal,items,budget?:16000,against?:[already_read_text]}` |
| search | `{goal,query,paths?:['.'],maxMatches?:100,budget?}`; literal ripgrep candidates, then semantic selection |
| filter_output | `{goal,path,budget?}` or `{goal,text,source?,budget?,against?}` |
| recall | `{artifactId,ids?:[item_id]}` or `{artifactId,query,offset?:0,limit?:20}`; omit both selectors for the full original |
| extract | `{path,fields:[{id,description}]}` or `{content,fields}`; max 20k characters/16 fields |

Use native exact search first when concrete task terms suffice. Do not send a large source merely because it is large. Filtering is useful when many unresolved semantic candidates would otherwise need reading. The `budget` is UTF-8 bytes, not tokens. Do not inflate it just to conceal incomplete coverage.

Read evidence once from `context`; `items` contains provenance without duplicate text. `excludedIds` are judged exclusions; `deferredIds` are unexamined overflow, not irrelevant evidence. `completeCoverage:false`, degraded answers, or protected overflow require attention before exhaustive claims. Uncertain, contradictory, unfinished status metadata and failure evidence must stay available. Identical bodies at different source locations or observations remain distinct; text-only `against` applies only to plain-text candidates. Recall only missing items by `artifactId` and IDs; the full original is recoverable. Source offsets/hashes are provenance, not proof of conclusions. Exact extraction leaves missing or ambiguous values unresolved.

Exclusion requires the configured conservative probability threshold; it is not a calibrated accuracy guarantee. Errors fall back to Codex review. Native context or billing savings must be measured separately from byte reductions.

The read-only tool embeds a compact coverage/recovery note in `context`, so emitting just the text no longer loses that information. It removes repeated probability distributions from per-record display metadata; the advanced tool and internal API retain their detailed results. It does not change the relevance threshold or remove review records. Evidence classification runs at most two independent batches concurrently under the same request guard.

When a specific gap appears and its ID is unknown, `recall` with `query` performs a case-insensitive literal search of original text, IDs and sources in that saved artifact. No Jev call is made. Follow `nextOffset` until it is null if all matches are needed; `matchedItems` counts literal matches only. A miss is not a semantic relevance judgment. Full recall remains available for changed goals, suspected omissions or tasks requiring exhaustive source verification.
