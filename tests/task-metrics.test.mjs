import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import {Store,Judge,loadConfig} from '../src/core.mjs';import {taskMetrics,summarizeTaskMetrics} from '../src/task-metrics.mjs';
const at='2026-09-25T00:00:00.000Z';
const call={at,kind:'jev_call',taskId:'task',requestId:'request',purpose:'evidence',status:'success',model:'jev-1.13.0',inputTokens:1000,outputTokens:20,elapsedMs:200};
const generation={at,kind:'generation_usage',threadId:'task',bridgeId:'bridge',turnId:'turn',measurementSource:'runtime',generation:1,configuredModel:'gpt-6-astra',usage:{inputTokens:10000,cachedInputTokens:8000,outputTokens:1000,reasoningOutputTokens:700}};
const completed={...generation,kind:'turn_usage',status:'completed',elapsedMs:1000};
test('task cost isolates tasks, deduplicates receipts, and never bills mirrored router decisions or reasoning twice',()=>{
 const r=summarizeTaskMetrics({taskId:'task',events:[call,call,{...call,taskId:'other',requestId:'other'}],runtimeEvents:[generation,generation,completed,completed]});
 assert.equal(r.jev.calls,1);assert.equal(r.jev.duplicateReceipts,1);assert.equal(r.jev.knownUsd,.000042);assert.equal(r.gpt.generations,1);assert.equal(r.gpt.knownUsd,.078);assert.equal(r.elapsed.observedTurnWallMs,1000);assert.equal(r.cost.accountingComplete,false);assert.equal(r.savings,null);
});
test('native effort receipts replace mirrored core charges; local budget skips are not billed requests',()=>{
 const r=summarizeTaskMetrics({taskId:'task',events:[{...call,purpose:'effort'}],runtimeEvents:[{...generation,kind:'decision',model:'jev-1.13.0',inputTokens:1000,outputTokens:20},{...generation,kind:'fallback',code:'TASK_WAIT_BUDGET'}]});
 assert.equal(r.jev.calls,1);assert.equal(r.jev.knownUsd,.000042);
 const unknown=summarizeTaskMetrics({taskId:'task',events:[],runtimeEvents:[{...generation,kind:'fallback',code:'JEV_TIMEOUT'}]});assert.equal(unknown.jev.unknownCostCalls,1);
});
test('failed, unscoped and unknown-model records remain explicit gaps',()=>{
 const r=summarizeTaskMetrics({taskId:'task',events:[{...call,taskId:null},{...call,status:'failed',inputTokens:null,outputTokens:null}],runtimeEvents:[{...generation,configuredModel:'unknown'}],truncated:true});
 assert.equal(r.jev.calls,1);assert.equal(r.jev.unknownCostCalls,1);assert.equal(r.gpt.unknownCostGenerations,1);assert.equal(r.cost.unattributedProjectCalls,1);assert.equal(r.cost.observedRecordsPriced,false);assert(r.cost.reasons.includes('unfinished_or_incomplete_observed_turn'));assert(r.cost.reasons.includes('event_window_truncated'));
});
test('time windows exclude earlier events; multiple generations/models retain separate pricing',()=>{
 const next={...generation,at:'2026-09-25T01:00:00.000Z',generation:2,configuredModel:'gpt-6-sol'};
 const r=summarizeTaskMetrics({taskId:'task',events:[call],runtimeEvents:[generation,next],since:'2026-09-25T00:30:00.000Z'});
 assert.equal(r.gpt.generations,1);assert.equal(r.jev.calls,0);assert(Math.abs(r.gpt.knownUsd-.0156)<1e-12);
});
test('Judge tags actual successful and failed calls with task identity and unique reservation IDs',async t=>{
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-task-metrics-'))});t.after(()=>store.close());
 let fail=false;const judge=new Judge({store,project:'project',taskId:'task',key:'fixture',config:{...loadConfig(store,'project'),cacheMs:0},send:async()=>{if(fail)throw Error('offline');return{model:'fixture',answers:{q:{type:'noul',noul:.5}}};}});
 await judge.ask('state',{q:{type:'noul',instructions:'Present?'}});fail=true;await assert.rejects(judge.ask('state',{q:{type:'noul',instructions:'Present?'}}));
 const calls=store.events('project').filter(e=>e.kind==='jev_call');assert.equal(calls.length,2);assert(calls.every(e=>e.taskId==='task'));assert.notEqual(calls[0].requestId,calls[1].requestId);
});
test('file reader excludes another project and synthetic runs and requires a real task ID',async t=>{
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-task-scope-'))});t.after(()=>store.close());
 const ctx={store,project:'project',judge:{}};mkdirSync(join(store.home,'runtime/desktop/logs'),{recursive:true});
 writeFileSync(join(store.home,'runtime/desktop/logs/events.jsonl'),[generation,{...generation,projectId:'other',generation:2},{...generation,projectId:'project',measurementSource:'synthetic',generation:3},{...generation,projectId:'project',generation:4}].map(JSON.stringify).join('\n'));
 const r=await taskMetrics(ctx,{taskId:'task'});assert.equal(r.gpt.generations,1);assert.equal(r.tierAssumed,true);
 store.event('other','jev_call',call);store.event('other','jev_call',{...call,requestId:'other-task',taskId:'other-task'});
 const all=await taskMetrics(ctx,{taskId:'task',scope:'task'});assert.equal(all.gpt.generations,3);assert.equal(all.jev.calls,1);assert.equal(all.scope,'one_task_across_local_projects');
 await assert.rejects(taskMetrics(ctx,{taskId:''}),{code:'REAL_TASK_ID_REQUIRED'});
 await assert.rejects(taskMetrics(ctx,{taskId:'task',tier:'guess'}),{code:'INVALID_SERVICE_TIER'});
});
