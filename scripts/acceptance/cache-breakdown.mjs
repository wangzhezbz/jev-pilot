// Recompute cache attribution from each generation, preserving observed totals.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const input=resolve(process.argv.find(x=>x.startsWith('--input='))?.slice(8)??'dist/investigation-packed-20260924/results.json');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/cache-breakdown-20260924');
const data=JSON.parse(await readFile(input,'utf8')),rows=[];
for(const r of data.records){
 const usage=[...new Map(r.usage.map(u=>[JSON.stringify(u.total),u])).values()];
 const generations=usage.map((u,i)=>({generation:i+1,input:u.last.inputTokens,cached:u.last.cachedInputTokens,uncached:u.last.inputTokens-u.last.cachedInputTokens,output:u.last.outputTokens}));
 rows.push({id:r.id,arm:r.arm,generations,first:generations[0],laterUncached:generations.slice(1).reduce((s,g)=>s+g.uncached,0)});
}
const byArm=Object.fromEntries(['bare','jev'].map(arm=>{const r=rows.filter(x=>x.arm===arm);return [arm,{firstInput:r.reduce((s,x)=>s+x.first.input,0),firstCached:r.reduce((s,x)=>s+x.first.cached,0),firstUncached:r.reduce((s,x)=>s+x.first.uncached,0),laterUncached:r.reduce((s,x)=>s+x.laterUncached,0)}];}));
const delta={firstUncached:byArm.jev.firstUncached-byArm.bare.firstUncached,laterUncached:byArm.jev.laterUncached-byArm.bare.laterUncached};delta.totalUncached=delta.firstUncached+delta.laterUncached;
const result={source:'investigation-packed-20260924',rows,byArm,delta,interpretation:'The first-request cache imbalance is larger than the aggregate uncached-input increase. Later-generation uncached input decreased. This does not establish stable savings or prove the cause of server cache placement. Do not silently normalize observed totals or call the existing cache broken.'};
await mkdir(out,{recursive:true});await writeFile(out+'/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({byArm,delta},null,2));
