// Offline accounting only. Keep failed/unknown usage; never treat it as free.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';import {homedir} from 'node:os';
import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {PRICE_SNAPSHOT,taskCost,gptRequestCost} from '../../src/cost.mjs';
const source=resolve(process.argv[2]),out=resolve(process.argv[3]);
const raw=await readFile(source,'utf8'),data=JSON.parse(raw);await mkdir(out,{recursive:true});
const fields=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens'];
const rows=[],receipts=[],cacheAudit=[];
for(const r of data.records){
 const events=[...(r.jevEvents??[]),...(r.externalJevEvents??[])];
 assert.equal(new Set(events.map(e=>JSON.stringify(e))).size,events.length,'Overlapping event ledgers');
 const calls=events.filter(e=>e.kind==='jev_call');let previous=Object.fromEntries(fields.map(k=>[k,0]));let last=null;
 for(const u of r.usage??[]){
  const delta=Object.fromEntries(fields.map(k=>[k,u.total[k]-previous[k]]));
  if(fields.every(k=>delta[k]===0)){assert(last);for(const k of fields)assert.equal(u.last[k],last[k]);continue;}
  for(const k of fields){assert(delta[k]>=0);assert.equal(delta[k],u.last[k],r.id+': usage mismatch '+k);}const cost=gptRequestCost(r.model,u.last);
  cacheAudit.push({id:r.id,generation:cacheAudit.filter(x=>x.id===r.id).length+1,
   inputTokens:u.last.inputTokens,cachedInputTokens:u.last.cachedInputTokens,
   uncachedInputTokens:u.last.inputTokens-u.last.cachedInputTokens-(u.last.cacheWriteInputTokens??0),
   cacheHitFraction:u.last.inputTokens?u.last.cachedInputTokens/u.last.inputTokens:null,
   cacheResetObserved:Boolean(last?.cachedInputTokens>0&&u.last.cachedInputTokens===0),
   inputGrew:last?u.last.inputTokens>=last.inputTokens:null,
   cause:'not_observable_from_usage',...cost});
  previous=u.total;last=u.last;
 }
 if(r.tokens)for(const k of fields)assert.equal(previous[k],r.tokens[k]);
 const standard=taskCost({model:r.model,usage:r.usage,jevCalls:calls,completed:r.status==='completed'});
 const components=Object.fromEntries(['uncachedInputUsd','cachedInputUsd','cacheWriteUsd','outputUsd'].map(k=>[k,cacheAudit.filter(x=>x.id===r.id).reduce((n,x)=>n+(x[k]??0),0)]));
 const fast=taskCost({model:r.model,usage:r.usage,jevCalls:calls,tier:'fast',completed:r.status==='completed'});
 rows.push({id:r.id,task:r.task,repeat:r.repeat,arm:r.arm,passed:r.passed,status:r.status,wallMs:r.wallMs,totalMs:r.totalMs,...r.tokens,...components,cacheResets:cacheAudit.filter(x=>x.id===r.id&&x.cacheResetObserved).length,generations:standard.generations,gptStandardUsd:standard.gptKnownUsd,jevKnownUsd:standard.jevKnownUsd,totalStandardKnownUsd:standard.knownUsd,totalFastKnownUsd:fast.knownUsd,unknownCalls:standard.unknownCalls,complete:standard.complete,jevCalls:calls.length,jevInputTokens:calls.reduce((n,c)=>n+(c.inputTokens??0),0),changes:(r.routing??[]).filter(e=>['applied','start_forwarded'].includes(e.status)&&e.from!==e.published).length});
 receipts.push({id:r.id,quality:r.quality,errors:r.errors,status:r.status,pluginVersion:r.pluginVersion,usage:r.usage,jevCalls:calls,routing:(r.routing??[]).filter(e=>['decision','effort_restore','generation_usage'].includes(e.kind)),preparations:events.filter(e=>['prepared_output','evidence_selection','classification_batches','operation'].includes(e.kind))});
}
const arms={};for(const arm of [...new Set(rows.map(r=>r.arm))]){
 const rs=rows.filter(r=>r.arm===arm);arms[arm]={runs:rs.length,passed:rs.filter(r=>r.passed).length,complete:rs.every(r=>r.complete)};
 for(const k of ['wallMs','totalMs','totalTokens','cachedInputTokens','outputTokens','gptStandardUsd','jevKnownUsd','totalStandardKnownUsd','totalFastKnownUsd','unknownCalls','jevCalls','jevInputTokens','changes','inputTokens','uncachedInputUsd','cachedInputUsd','cacheWriteUsd','outputUsd','cacheResets'])arms[arm][k]=rs.reduce((s,r)=>s+(r[k]??0),0);
}
const pairs=[];for(const a of rows.filter(r=>r.arm!=='bare')){const b=rows.find(r=>r.arm==='bare'&&r.task===a.task&&r.repeat===a.repeat);if(!b)continue;pairs.push({task:a.task,repeat:a.repeat,bothPassed:a.passed&&b.passed,costComplete:a.complete&&b.complete,timeIncreasePercent:100*(a.wallMs/b.wallMs-1),knownCostIncreasePercent:100*(a.totalStandardKnownUsd/b.totalStandardKnownUsd-1)});}
const summary={planned:data.protocol.runs,attempted:rows.length,prices:PRICE_SNAPSHOT,serviceTier:'Not observed; standard and fast are separate API-equivalent scenarios, never subscription debits.',arms,pairs};
const clean=value=>{const text=JSON.stringify(value,null,2);assert(!/apikey_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}/.test(text));return text.replaceAll(homedir(),'<HOME>').replaceAll(/\/var\/folders\/[^/]+\/[^/]+\/T\//g,'<TMP>/')+'\n';};
for(const [name,value]of Object.entries({'protocol.json':data.protocol,'cost-summary.json':summary,'cost-receipts.json':receipts,'cost-runs.json':rows,'cache-audit.json':cacheAudit}))await writeFile(out+'/'+name,clean(value));
const keys=Object.keys(rows[0]??{}),csv=v=>JSON.stringify(String(v??''));await writeFile(out+'/cost-runs.csv',[keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\n')+'\n');
await writeFile(out+'/source-hash.json',clean({sourceSha256:createHash('sha256').update(raw).digest('hex')}));console.log(JSON.stringify(summary,null,2));
