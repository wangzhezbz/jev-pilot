import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,Judge,loadConfig,requestFits} from '../src/core.mjs';
import {Pilot} from '../src/pilot.mjs';
function fixture(t,send) {
  const home=mkdtempSync(join(tmpdir(),'jev-delivery-')),store=new Store({home});
  const project=store.project(home),config=loadConfig(store,project),pilot=new Pilot({store,key:'fixture',send});t.after(()=>pilot.close());
  return {store,home,project,config,pilot,call:(operation,input)=>pilot.call({workspace:home,operation,input})};
}
function response(payload,choice='keep',probabilities) {
  return {model:'fixture',answers:Object.fromEntries(Object.keys(payload.questions).map(id=>[id,{type:'choice',choice,probabilities:probabilities||{keep:choice==='keep'?1:0,review:0,exclude:choice==='exclude'?1:0}}]))};
}
test('diagnostics separate matched filters from legacy and window-truncated records',async t=>{
 const f=fixture(t,async p=>response(p));
 for(const event of [
  {kind:'automatic_output_filter'},
  {kind:'automatic_output_filter',boundaryId:'outside-window'},
  {kind:'automatic_output_admission',boundaryId:'small',reason:'small'},
  {kind:'automatic_output_admission',boundaryId:'matched',reason:'eligible'},
  {kind:'automatic_output_filter',boundaryId:'matched'},
 ]){const {kind,...data}=event;f.store.event(f.project,kind,data);}
 const r=await f.call('diagnostics',{});
 assert.equal(r.outputAdmission.observed,2);assert.equal(r.outputAdmission.applied,0);
 assert.equal(r.outputAdmission.submitted,3);assert.equal(r.outputAdmission.unconfirmed,3);
 assert.equal(r.outputAdmission.matchedSubmitted,1);assert.equal(r.outputAdmission.unmatchedSubmitted,2);
 assert.equal(r.outputAdmission.matchedApplied,0);assert.equal(r.outputAdmission.unmatchedApplied,0);
 assert.equal(r.outputAdmission.coverageRate,null);
});
test('long shared Chinese task fits once instead of overflowing 24 repeated questions',async t=>{
  const sent=[],f=fixture(t,async p=>{sent.push(p);return response(p);});
  const instruction='任务背景'.repeat(500);
  const r=await f.call('decide',{items:Array.from({length:24},(_,i)=>({id:'i'+i,text:'short '+i})),question:instruction,choices:{keep:'keep',review:'review',exclude:'exclude'}});
  assert.equal(sent.length,1);assert.equal(sent[0].state.task,instruction);assert.equal(requestFits(sent[0]),true);
  assert.equal(JSON.stringify(sent[0]).split(instruction).length,2);assert.equal(r.decisions.every(x=>x.source==='jev'),true);
});
test('actual state budget splits batches and oversized items stay visible as fallback',async t=>{
  const sent=[],f=fixture(t,async p=>{sent.push(p);return response(p);});
  const r=await f.call('decide',{items:[{id:'a',text:'a'.repeat(18000)},{id:'huge',text:'文'.repeat(20000)},{id:'b',text:'b'.repeat(18000)}],question:'select',choices:{keep:'keep',review:'review',exclude:'exclude'}});
  assert.equal(sent.length,2);assert.equal(sent.every(requestFits),true);
  assert.deepEqual(r.decisions.map(x=>x.id),['a','huge','b']);assert.equal(r.decisions[1].reason,'REQUEST_LIMIT');
});
test('cache zero bypasses old entries and does not refresh them',async t=>{
  let calls=0;const f=fixture(t,async p=>{calls++;return response(p);});
  const input={items:[{id:'a',text:'source'}],question:'select',choices:{keep:'keep',review:'review',exclude:'exclude'}};
  await f.call('decide',input);await f.call('configure',{cacheMs:0});await f.call('decide',input);await f.call('decide',input);assert.equal(calls,3);
});
test('gray exclusion is retained, duplicates are judged once, protected errors use no model decision',async t=>{
  let questions=0;const f=fixture(t,async p=>{questions+=Object.keys(p.questions).length;return response(p,'exclude',{keep:.34,review:.31,exclude:.35});});
  const r=await f.call('select',{goal:'test',items:[{id:'a',text:'possible context'},{id:'b',text:'possible context'},{id:'c',text:'错误：请求失败'}]});
  assert.equal(questions,1);assert.deepEqual(r.duplicateIds,['b']);assert.deepEqual(r.excludedIds,[]);assert.deepEqual(r.items.map(x=>x.id),['a','c']);
  assert.equal((await f.call('recall',{artifactId:r.artifactId})).items.length,3);
});
test('compaction preserves pending work and paths, and retries failed judgments',async t=>{
  let fail=true;const f=fixture(t,async p=>{if(fail)throw Error('offline');return response(p,'exclude');});
  const pair=(id,content)=>[{id:id+'c',callId:id,role:'tool_call',content:'read',readOnly:true,verified:true},{id:id+'r',callId:id,role:'tool_result',content}];
  const blocks=[...pair('a','old context'),...pair('b','TODO investigate'),...pair('c','read src/file.mjs'),{id:'u',role:'user',content:'continue'}];
  const first=await f.call('compact',{goal:'continue',blocks,preserveRecent:1});assert.equal(first.degraded,true);assert.deepEqual(first.omittedCallIds,[]);
  fail=false;const second=await f.call('compact',{goal:'continue',blocks,preserveRecent:1});assert.deepEqual(second.omittedCallIds,['a']);assert.equal(second.reusedJudgments,0);
});

import {RequestGuard} from '../src/request-guard.mjs';
test('shared reservations bound concurrent calls, input and elapsed wait across connections',t=>{
  const f=fixture(t,async()=>{}),other=new Store({home:f.home});t.after(()=>other.close());
  const config={taskMaxCalls:2,taskMaxBytes:100,taskMaxWaitMs:500};
  const a=new RequestGuard({store:f.store,project:f.project,taskId:'same',config});
  const b=new RequestGuard({store:other,project:f.project,taskId:'same',config});
  const first=a.reserve({bytes:60,timeoutMs:500,model:'test'});
  assert.throws(()=>b.reserve({bytes:1,timeoutMs:100,model:'test'}),{code:'TASK_WAIT_BUDGET'});
  a.finish(first,{status:'success',elapsedMs:50});
  assert.throws(()=>b.reserve({bytes:41,timeoutMs:100,model:'test'}),{code:'TASK_INPUT_BUDGET'});
  const second=b.reserve({bytes:40,timeoutMs:500,model:'test'});assert.equal(second.allowance,450);
  b.finish(second,{status:'success',elapsedMs:10});
  assert.throws(()=>a.reserve({bytes:0,timeoutMs:100,model:'test'}),{code:'TASK_CALL_BUDGET'});
  const separate=new RequestGuard({store:f.store,project:f.project,taskId:'different',config});
  assert.equal(separate.reserve({bytes:1,timeoutMs:100,model:'test'}).scope,'task');
});
test('cooldown survives new instances, allows one recovery probe and ignores obsolete success',t=>{
  const f=fixture(t,async()=>{});let clock=100000;
  const make=()=>new RequestGuard({store:f.store,project:f.project,taskId:'test',clock:()=>clock,config:{failureThreshold:2,cooldownMs:1000}});
  const reserve=g=>g.reserve({bytes:1,timeoutMs:100,model:'test'}),a=make(),late=reserve(a);
  for(let i=0;i<2;i++){const r=reserve(a);a.finish(r,{status:'failed',elapsedMs:1});}
  a.finish(late,{status:'success',elapsedMs:1});
  assert.throws(()=>reserve(make()),{code:'JEV_COOLDOWN'});clock+=1001;
  const b=make(),probe=reserve(b);assert.throws(()=>reserve(make()),{code:'JEV_COOLDOWN'});
  b.finish(probe,{status:'success',elapsedMs:1});const again=reserve(make());a.finish(again,{status:'cancelled',elapsedMs:1});
  assert.doesNotThrow(()=>reserve(make()));
});
test('expired reservations charge their full wait instead of silently releasing it',t=>{
  const f=fixture(t,async()=>{});let clock=100000;const g=new RequestGuard({store:f.store,project:f.project,clock:()=>clock,config:{taskMaxWaitMs:200}});
  assert.equal(g.reserve({bytes:1,timeoutMs:200,model:'test'}).scope,'workspace-window');clock+=1201;
  assert.throws(()=>g.reserve({bytes:1,timeoutMs:100,model:'test'}),{code:'TASK_WAIT_BUDGET'});
});
test('separate Pilot calls share task budget and shadow mode exposes proposals without deleting evidence',async t=>{
  let calls=0;const f=fixture(t,async p=>{calls++;return response(p,'exclude');});
  await f.call('configure',{evidenceMode:'shadow',taskMaxCalls:1,cacheMs:0});
  const first=await f.call('select',{taskId:'task',goal:'test',items:[{id:'a',text:'unrelated'}]});
  assert.deepEqual(first.proposedExcludedIds,['a']);assert.deepEqual(first.excludedIds,[]);assert.equal(first.items.length,1);
  const second=await f.call('select',{taskId:'task',goal:'test',items:[{id:'b',text:'another'}]});
  assert.equal(calls,1);assert.equal(second.degraded,true);assert.equal(second.items.length,1);
  assert.equal(f.store.events(f.project).find(e=>e.kind==='judgment_skipped').reason,'TASK_CALL_BUDGET');
});

test('policy evaluation keeps holdout out of fitting and never activates automatically',async t=>{
  const f=fixture(t,async()=>{});
  const rows=Array.from({length:240},(_,i)=>({id:'s'+i,group:'independent'+i,split:i<120?'fit':'holdout',gold:i%6===0?'keep':'exclude',choice:i%6===0?'keep':'exclude',probability:.99}));
  const input={domain:'fixture',model:'fixture',rubricHash:'version-a',rows};
  const good=await f.call('evaluate_policy',input);assert.equal(good.status,'heldout-pass');assert.equal(good.applied,false);
  const bad=await f.call('evaluate_policy',{...input,rows:rows.map(r=>r.split==='holdout'?{...r,gold:'keep'}:r)});
  assert.equal(bad.threshold,good.threshold);assert.equal(bad.status,'insufficient-or-failed');assert.equal(bad.holdout.falseExclusions,100);
  await assert.rejects(f.call('evaluate_policy',{...input,rows:rows.map((r,i)=>i===120?{...r,group:rows[0].group}:r)}),{code:'HOLDOUT_LEAKAGE'});
  const d=await f.call('diagnostics');assert.equal(d.latestEvaluation.id,bad.id);assert.equal(d.policy.thresholdCalibrated,false);
});
test('uncertain tool exclusion and optional test deferral stay available',async t=>{
  const f=fixture(t,async p=>({model:'fixture',answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>{
    const keys=Object.keys(q.criteria),choice=keys.includes('skip')?'skip':keys.includes('defer')?'defer':keys[0];
    return [id,{type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?.35:.325]))}];
  }))}));
  const tools=await f.call('select_tools',{goal:'task',tools:[{id:'a',text:'possibly useful'}]});assert.equal(tools.selected.length,1);
  const review=await f.call('review',{goal:'task',changes:[],tests:[{id:'test',text:'possibly useful'}]});assert.deepEqual(review.run,['test']);
});
test('old relevant memories compete before the 100-candidate limit',async t=>{
  const f=fixture(t,async p=>({model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>[id,{type:'choice',choice:'use',probabilities:{use:1,review:0,skip:0}}]))}));
  await f.call('configure',{memory:true});f.store.put(f.project,'receipt',{status:'passed',sourceHashes:{}},'receipt');
  for(let i=0;i<105;i++)f.store.put(f.project,'memory',{content:i===0?'legacy invoice rounding decision':'recent cafeteria menu '+i,topic:'history',source:{receiptId:'receipt'},expiresAt:Date.now()+100000},'memory'+i);
  const r=await f.call('memory',{action:'retrieve',goal:'invoice rounding'});assert.equal(r.memories[0].id,'memory0');assert.equal(r.truncated,true);assert.equal(r.deferredIds.length,5);
});

import {makeJudge} from '../runtime/desktop/router.mjs';
test('desktop judging delegates through the shared guard with local task context',async t=>{
  const f=fixture(t,async()=>{}),seen=[];
  const judge=await makeJudge('/missing',{env:{TYPESAFE_API_KEY:'fixture'},send:()=>{throw Error('unguarded');},judgeFactory:(context,key)=>({ask:async(state,questions,purpose)=>{seen.push({context,key,purpose});return {model:'fixture',answers:{effort:{choice:'keep'},horizon:{choice:'1'}}};}})});
  await judge({task:'bounded'},{taskId:'task',cwd:f.home});assert.deepEqual(seen,[{context:{taskId:'task',cwd:f.home},key:'fixture',purpose:'effort'}]);
});

test('synchronous transport failures do not poison in-flight state; missing keys are visible',async t=>{
  let count=0;const f=fixture(t,()=>{}),judge=new Judge({store:f.store,project:f.project,config:{...f.config,cacheMs:0},key:'fixture',send:p=>{if(count++===0)throw Error('sync failure');return response(p);}});
  const q={q:{type:'choice',instructions:'test',criteria:{keep:'keep',review:'review',exclude:'exclude'}}};
  await assert.rejects(judge.ask('same',q));assert.equal((await judge.ask('same',q)).answers.q.choice,'keep');
  const noKey=new Judge({store:f.store,project:f.project,config:f.config,key:''});await assert.rejects(noKey.ask('test',q),{code:'MISSING_KEY'});
  assert.equal(f.store.events(f.project).find(e=>e.kind==='judgment_skipped').reason,'MISSING_KEY');
});

test('one failed compaction batch retains every exchange, including successful batch proposals',async t=>{
  let calls=0;const f=fixture(t,async p=>{if(++calls===2)throw Error('offline');return response(p,'exclude');});
  const blocks=Array.from({length:26},(_,i)=>[{id:'c'+i,callId:'pair'+i,role:'tool_call',readOnly:true,verified:true,content:'read obsolete material'},{id:'r'+i,callId:'pair'+i,role:'tool_result',content:'irrelevant history '.repeat(100)}]).flat();
  blocks.push({id:'recent',role:'user',content:'current task'});
  const r=await f.call('compact',{goal:'current task',blocks,preserveRecent:1});
  assert.ok(calls>=2);assert.equal(r.degraded,true);assert.deepEqual(r.omittedCallIds,[]);assert.equal(r.blocks.length,blocks.length);assert.ok(r.proposedOmittedCallIds.length>0);
});
test('routine requests preserve shared urgent wait and call capacity without increasing totals',t=>{
 const f=fixture(t,async()=>{});const g=new RequestGuard({store:f.store,project:f.project,taskId:'reserved',config:{taskMaxCalls:10,taskMaxWaitMs:1000,taskReservedCalls:2,taskReservedWaitMs:200}});
 const ordinary=g.reserve({bytes:1,timeoutMs:1000,model:'fixture'});assert.equal(ordinary.allowance,800);g.finish(ordinary,{status:'success',elapsedMs:800});
 assert.throws(()=>g.reserve({bytes:1,timeoutMs:200,model:'fixture'}),{code:'TASK_URGENT_RESERVE'});
 const urgent=g.reserve({bytes:1,timeoutMs:500,model:'fixture',priority:'urgent'});assert.equal(urgent.allowance,200);g.finish(urgent,{status:'success',elapsedMs:200});
 assert.throws(()=>g.reserve({bytes:1,timeoutMs:200,model:'fixture',priority:'urgent'}),{code:'TASK_WAIT_BUDGET'});
 const calls=new RequestGuard({store:f.store,project:f.project,taskId:'calls',config:{taskMaxCalls:5,taskMaxWaitMs:10000,taskReservedCalls:2}});
 for(let i=0;i<4;i++){const r=calls.reserve({bytes:1,timeoutMs:100,model:'fixture'});calls.finish(r,{status:'success',elapsedMs:1});}
 assert.throws(()=>calls.reserve({bytes:1,timeoutMs:100,model:'fixture'}),{code:'TASK_URGENT_RESERVE'});
 const last=calls.reserve({bytes:1,timeoutMs:100,model:'fixture',priority:'urgent'});calls.finish(last,{status:'success',elapsedMs:1});
 assert.throws(()=>calls.reserve({bytes:1,timeoutMs:100,model:'fixture',priority:'urgent'}),{code:'TASK_CALL_BUDGET'});
});
test('separate callers share byte and in-flight wait reserves without borrowing urgent capacity',t=>{
 const f=fixture(t,async()=>{}),config={taskMaxBytes:1000,taskReservedBytes:999,taskMaxWaitMs:1000,taskReservedWaitMs:200};
 const create=taskId=>new RequestGuard({store:f.store,project:f.project,taskId,config});
 const a=create('bytes'),b=create('bytes'),first=a.reserve({bytes:800,timeoutMs:100,model:'fixture'});
 assert.throws(()=>b.reserve({bytes:1,timeoutMs:100,model:'fixture'}),{code:'TASK_URGENT_RESERVE'});
 b.reserve({bytes:200,timeoutMs:100,model:'fixture',priority:'urgent'});
 assert.throws(()=>a.reserve({bytes:1,timeoutMs:100,model:'fixture',priority:'urgent'}),{code:'TASK_INPUT_BUDGET'});
 a.finish(first,{status:'success',elapsedMs:1});
 const c=create('wait'),d=create('wait');c.reserve({bytes:1,timeoutMs:800,model:'fixture'});
 assert.throws(()=>d.reserve({bytes:1,timeoutMs:100,model:'fixture'}),{code:'TASK_URGENT_RESERVE'});
 assert.equal(d.reserve({bytes:1,timeoutMs:800,model:'fixture',priority:'urgent'}).allowance,200);
 assert.throws(()=>c.reserve({bytes:1,timeoutMs:100,model:'fixture',priority:'urgent'}),{code:'TASK_WAIT_BUDGET'});
});
