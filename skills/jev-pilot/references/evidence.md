# Evidence operations

## Prepare before presentation

`jev_evidence` is a separate read-only tool. It accepts only `prepare` and `recall`, with the usual `{workspace,operation,input}` envelope. Preparation accepts `{goal,value,source?,exact?,taskId?}` or `{goal,path,exact?,taskId?}` and returns `{value,selection}`. The `value` preserves the input envelope, exit code and metadata; only a supported text field may be shortened. Failed/unfinished commands, structured data, images, exact text, code files, small inputs, insufficient reduction, disabled Jev or judgment failure return the original. File permissions and private-path checks still apply. Jev receives eligible evidence under the existing credential and request budget.

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

## Existing evidence operations

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
