import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
import {requireValue} from './core.mjs';
import {gptRequestCost,jevRequestCost,PRICE_SNAPSHOT} from './cost.mjs';

// Native router receipts own effort cost; tagged core records own the other
// workflows. Never bill an effort request once in each source.
export function summarizeTaskMetrics({taskId,events,runtimeEvents,tier='standard',since=null,truncated=false,runtimeReadError=null}){
 const inWindow=e=>!since||e.at>=since;
 const native=runtimeEvents.filter(e=>e.threadId===taskId&&e.measurementSource==='runtime'&&inWindow(e));
 const unscoped=events.filter(e=>e.kind==='jev_call'&&e.purpose!=='effort'&&!e.taskId&&inWindow(e));
 const calls=events.filter(e=>e.kind==='jev_call'&&e.purpose!=='effort'&&e.taskId===taskId&&inWindow(e));
 const localSkips=new Set(['MISSING_KEY','DISABLED','CALL_BUDGET','TASK_CALL_BUDGET','TASK_INPUT_BUDGET','TASK_WAIT_BUDGET','TASK_URGENT_RESERVE','JEV_COOLDOWN','REQUEST_LIMIT']);
 for(const e of native)if(e.kind==='decision'||e.kind==='fallback'&&!localSkips.has(e.code))calls.push({...e,purpose:'effort',status:e.kind==='fallback'?'failed':'success',requestId:`native:${e.bridgeId}:${e.turnId}:${e.at}:${e.kind}`});
 const seen=new Set(),unique=[];
 for(const e of calls){if(e.requestId&&seen.has(e.requestId))continue;if(e.requestId)seen.add(e.requestId);unique.push(e);}
 const generations=new Map();let invalidGenerationIds=0;
 for(const e of native)if(e.kind==='generation_usage'&&(!e.bridgeId||!e.turnId||!Number.isInteger(e.generation)))invalidGenerationIds++;
 for(const e of native)if(e.kind==='generation_usage'&&e.bridgeId&&e.turnId&&Number.isInteger(e.generation))generations.set(`${e.bridgeId}:${e.turnId}:${e.generation}`,e);
 const gpt=[...generations.values()].map(e=>({model:e.configuredModel,...gptRequestCost(e.configuredModel,e.usage,{tier})}));
 const jev=unique.map(e=>jevRequestCost(e.model,e.inputTokens));
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 const total=(rows,key)=>rows.reduce((n,e)=>n+(valid(e[key])?e[key]:0),0);
 const known=rows=>rows.reduce((n,e)=>n+(e.usd??0),0);
 const purposes={};for(const e of unique){const p=purposes[e.purpose??'unknown']??={calls:0,failed:0,knownInputTokens:0,requestElapsedMs:0};p.calls++;p.failed+=e.status==='failed'?1:0;p.knownInputTokens+=valid(e.inputTokens)?e.inputTokens:0;p.requestElapsedMs+=Number.isFinite(e.elapsedMs)?e.elapsedMs:0;}
 const reasons=[];if(unscoped.length)reasons.push('legacy_calls_without_task_identity');if(truncated)reasons.push('event_window_truncated');if(runtimeReadError)reasons.push(runtimeReadError);
 if(invalidGenerationIds)reasons.push('unidentifiable_generation_records');
 if(!gpt.length)reasons.push('no_native_generation_observations');
 if(gpt.some(e=>e.usd===null)||jev.some(e=>e.usd===null))reasons.push('unknown_price_or_usage');
 const turnUsage=new Map(),turns=new Map();for(const e of native)if(e.turnId){const id=`${e.bridgeId}:${e.turnId}`;if(!turns.has(id))turns.set(id,false);if(e.kind==='turn_usage'){turns.set(id,e.status==='completed'&&!e.invalidUsageEvents);turnUsage.set(id,e);}}
 if([...turns.values()].some(v=>!v))reasons.push('unfinished_or_incomplete_observed_turn');
 return {scope:'one_task_in_one_project',taskId,since,tier,priceDate:PRICE_SNAPSHOT.date,
  jev:{calls:unique.length,duplicateReceipts:calls.length-unique.length,failures:unique.filter(e=>e.status==='failed').length,cancellations:unique.filter(e=>e.status==='cancelled').length,
   inputTokens:total(unique,'inputTokens'),outputTokens:total(unique,'outputTokens'),unknownInputUsage:unique.filter(e=>!valid(e.inputTokens)).length,unknownOutputUsage:unique.filter(e=>!valid(e.outputTokens)).length,
   knownUsd:known(jev),unknownCostCalls:jev.filter(e=>e.usd===null).length,byPurpose:purposes},
  gpt:{generations:gpt.length,inputTokens:total([...generations.values()].map(e=>e.usage??{}),'inputTokens'),cachedInputTokens:total([...generations.values()].map(e=>e.usage??{}),'cachedInputTokens'),outputTokens:total([...generations.values()].map(e=>e.usage??{}),'outputTokens'),
   knownUsd:known(gpt),unknownCostGenerations:gpt.filter(e=>e.usd===null).length},
  cost:{knownUsd:known(gpt)+known(jev),basis:'observed_public_api_equivalent_not_account_debit',accountingComplete:false,observedRecordsPriced:reasons.length===0,reasons,unattributedProjectCalls:unscoped.length},
  elapsed:{observedTurnWallMs:[...turnUsage.values()].reduce((n,e)=>n+(Number.isFinite(e.elapsedMs)?e.elapsedMs:0),0),jevRequestMs:unique.reduce((n,e)=>n+(Number.isFinite(e.elapsedMs)?e.elapsedMs:0),0),note:'Request times may overlap and are not additive task wall time; turn sums exclude user pauses and setup.'},
  savings:null,note:'Observed subtotal only. Missing, legacy and in-flight usage is not zero; no matched baseline or account debit is inferred.'};
}

export async function taskMetrics(ctx,input){
 const taskId=input.taskId;requireValue(typeof taskId==='string'&&/^[\w.:-]{1,128}$/.test(taskId),'REAL_TASK_ID_REQUIRED');
 const scope=input.scope??'project';requireValue(['project','task'].includes(scope),'INVALID_METRICS_SCOPE');
 const tier=input.tier??'standard';requireValue(['standard','fast'].includes(tier),'INVALID_SERVICE_TIER');
 let since=null;if(input.since!==undefined){requireValue(typeof input.since==='string'&&Number.isFinite(Date.parse(input.since)),'INVALID_TIME');since=new Date(input.since).toISOString();}
 const events=scope==='task'?ctx.store.db.prepare(`SELECT at,kind,body FROM events WHERE kind='jev_call'
   AND (json_extract(body,'$.taskId')=? OR json_extract(body,'$.taskId') IS NULL)
   AND (? IS NULL OR at>=?) ORDER BY seq DESC LIMIT 10001`).all(taskId,since,since).map(r=>({at:r.at,kind:r.kind,...JSON.parse(r.body)})):
   ctx.store.events(ctx.project,10001),truncated=events.length>10000;
 const runtimeEvents=[];let runtimeReadError=null;
 const stream=createReadStream(join(ctx.store.home,'runtime/desktop/logs/events.jsonl'),{encoding:'utf8'});
 try{
  const lines=createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of lines){
   requireValue(!ctx.judge.signal?.aborted,'CANCELLED');
   let e;try{e=JSON.parse(line);}catch{runtimeReadError='malformed_runtime_records';continue;}
   if((scope==='task'||e.projectId===ctx.project)&&e.threadId===taskId&&(!since||e.at>=since))runtimeEvents.push(e);
  }
 }catch(e){if(e.code==='CANCELLED')throw e;runtimeReadError='runtime_log_unavailable';}finally{stream.destroy();}
 return {...summarizeTaskMetrics({taskId,events:events.slice(0,10000),runtimeEvents,tier,since,truncated,runtimeReadError}),scope:scope==='task'?'one_task_across_local_projects':'one_task_in_one_project',unattributedScope:scope==='task'?'all_local_projects_possible_not_assigned':'current_project_possible_not_assigned',tierAssumed:input.tier===undefined};
}
