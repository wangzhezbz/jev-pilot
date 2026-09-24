import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,Judge,loadConfig} from '../src/core.mjs';
import {selectEvidence} from '../src/evidence.mjs';
import {prepareOutput} from '../src/prepare-output.mjs';

function fixture(t,config={}){
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-complete-'))});t.after(()=>store.close());
 const ctx={store,project:'fixture',config:{...loadConfig(store,'fixture'),cacheMs:0,...config}};let calls=0;
 ctx.judge=new Judge({...ctx,key:'fixture',taskId:'synthetic-admission-test',send:async p=>{
  calls++;return{model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>[id,{type:'choice',choice:'exclude',probabilities:{keep:0,review:0,exclude:1}}]))};
 }});
 return{ctx,calls:()=>calls};
}
const items=Array.from({length:49},(_,i)=>({id:'i'+i,text:`Unrelated resolved record ${i} `+'detail '.repeat(35)}));
test('complete filtering refuses an insufficient shared call budget before paying for partial work',async t=>{
 const f=fixture(t,{taskMaxCalls:1});
 await assert.rejects(selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true}),{code:'TASK_CALL_BUDGET'});
 assert.equal(f.calls(),0);assert.equal(f.ctx.store.list('fixture','task_budget').length,0);
});
test('complete filtering checks total bytes, not only whether its first batch fits',async t=>{
 const f=fixture(t,{taskMaxBytes:17000,taskReservedBytes:0});
 await assert.rejects(selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true}),{code:'TASK_INPUT_BUDGET'});
 assert.equal(f.calls(),0);
});
test('insufficient shared budget preserves exact original presentation with zero requests',async t=>{
 const f=fixture(t,{taskMaxCalls:1});const body=items.map((x,i)=>`## Record ${i}\n${x.text}\n`).join('\n');
 const r=await prepareOutput(f.ctx,{goal:'Find target facts',value:body});
 assert.equal(r.value,body);assert.equal(r.selection.status,'original');assert.equal(f.calls(),0);
});
test('adequate shared budget still classifies all batches',async t=>{
 const f=fixture(t);const r=await selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true});
 assert.equal(f.calls(),3);assert.equal(r.excludedIds.length,49);assert.equal(r.degraded,false);
});
test('complete admission respects the minimum wait budget while partial selection remains available',async t=>{
 const f=fixture(t,{taskMaxWaitMs:250,taskReservedWaitMs:0});
 await assert.rejects(selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true}),{code:'TASK_WAIT_BUDGET'});
 assert.equal(f.calls(),0);
 const g=fixture(t,{taskMaxCalls:1});const partial=await selectEvidence(g.ctx,{goal:'Find target facts',items});
 assert.equal(g.calls(),1);assert.equal(partial.degraded,true);assert(partial.items.length>0);
});
test('cached candidates require no new shared call budget',async t=>{
 const f=fixture(t,{cacheMs:600000,taskMaxCalls:3,taskReservedCalls:0});
 await selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true});
 const r=await selectEvidence(f.ctx,{goal:'Find target facts',items,requireCompleteJudgment:true});
 assert.equal(f.calls(),3);assert.equal(r.excludedIds.length,49);
});
test('invalid answers retain provider-reported usage but cannot enter response cache',async t=>{
 const f=fixture(t,{cacheMs:600000});f.ctx.judge.send=async()=>({model:'fixture',usage:{input_tokens:123,output_tokens:7},answers:{}});
 await assert.rejects(f.ctx.judge.ask('state',{q:{type:'noul',instructions:'Is this present?'}}),{code:'INVALID_ANSWER'});
 const calls=f.ctx.store.events('fixture').filter(e=>e.kind==='jev_call');
 assert.equal(calls.length,1);assert.equal(calls[0].status,'failed');assert.equal(calls[0].inputTokens,123);assert.equal(calls[0].outputTokens,7);
 assert.equal(f.ctx.store.db.prepare('SELECT count(*) n FROM cache').get().n,0);
});
test('malformed provider usage remains unknown on invalid answers',async t=>{
 const f=fixture(t);f.ctx.judge.send=async()=>({model:'fixture',usage:{input_tokens:-1,output_tokens:'7'},answers:{}});
 await assert.rejects(f.ctx.judge.ask('state',{q:{type:'noul',instructions:'Is this present?'}}));
 const e=f.ctx.store.events('fixture').find(e=>e.kind==='jev_call');assert.equal(e.inputTokens,null);assert.equal(e.outputTokens,null);
});
