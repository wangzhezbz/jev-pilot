// Offline arithmetic over observed native receipts. No API calls.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {gptRequestCost,jevRequestCost,PRICE_SNAPSHOT} from '../../src/cost.mjs';
const root=resolve(process.argv[2]);
const native=JSON.parse(await readFile(root+'/accounting/cost-runs.json','utf8'));
const ui=JSON.parse(await readFile(root+'/ui/usage.json','utf8'));
for(const r of ui.runs){
  const model=r.cells[0].model;
  r.cost={gptUsd:0,jevUsd:0,unknownCalls:0};
  for(const c of r.cells){
    const u=c.usage;
    const cost=gptRequestCost(model,{inputTokens:u.input_tokens,cachedInputTokens:u.cached_input_tokens,outputTokens:u.output_tokens,cacheWriteInputTokens:u.cache_write_input_tokens??0});
    if(cost.usd===null)r.cost.unknownCalls++;else r.cost.gptUsd+=cost.usd;
  }
  assert(Array.isArray(r.allObservedJevCalls),'Must reconcile host/store calls first');
  for(const j of r.allObservedJevCalls){const c=jevRequestCost(j.model,j.inputTokens);if(c.usd===null)r.cost.unknownCalls++;else r.cost.jevUsd+=c.usd;}
  r.cost.totalKnownUsd=r.cost.gptUsd+r.cost.jevUsd;
}
const percent=(a,b)=>100*(b/a-1);
const nativePairs=native.filter(r=>r.arm==='bare').map(b=>{
  const a=native.find(r=>r.arm==='combined'&&r.task===b.task);
  return {task:b.task,passed:b.passed&&a.passed,seconds:[b.wallMs/1000,a.wallMs/1000],gptTokens:[b.totalTokens,a.totalTokens],usd:[b.totalStandardKnownUsd,a.totalStandardKnownUsd],timePercent:percent(b.wallMs,a.wallMs),gptPercent:percent(b.totalTokens,a.totalTokens),costPercent:percent(b.totalStandardKnownUsd,a.totalStandardKnownUsd)};
});
const uiPairs=['chrome','cua'].map(platform=>{
 const b=ui.runs.find(r=>r.id===platform+'-bare'),a=ui.runs.find(r=>r.id===platform+'-pilot');
 return {platform,passed:b.passed&&a.passed,seconds:[b.elapsedMs/1000,a.elapsedMs/1000],gptTokens:[b.gpt.total_tokens,a.gpt.total_tokens],usd:[b.cost.totalKnownUsd,a.cost.totalKnownUsd],timePercent:percent(b.elapsedMs,a.elapsedMs),gptPercent:percent(b.gpt.total_tokens,a.gpt.total_tokens),costPercent:percent(b.cost.totalKnownUsd,a.cost.totalKnownUsd)};
});
const output={prices:PRICE_SNAPSHOT,scope:'Native independent task pairs and shared-task UI episodes are separate populations. Do not pool them into a marketing savings number.',nativePairs,uiPairs};
await writeFile(root+'/ui/cost-usage.json',JSON.stringify(ui,null,2)+'\n');
await writeFile(root+'/summary.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
