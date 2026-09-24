import test from 'node:test';import assert from 'node:assert/strict';
import {Router,effortQuestion,horizonQuestion,routineProgress} from '../runtime/desktop/router.mjs';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Pilot} from '../src/pilot.mjs';import {Store} from '../src/core.mjs';
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
function routeFixture(selected='medium'){
 let calls=0;const updates=[],r=new Router({coalesceMs:0,judge:async()=>{calls++;return{answer:choice(effortQuestion,selected),horizon:choice(horizonQuestion,'1')};},request:async(m,p)=>{updates.push(p);return{status:'applied'};}});
 r.supported.set('gpt-6-sol',['low','medium','high']);const p={threadId:'s',model:'gpt-6-sol',effort:'medium',input:[{type:'text',text:'Investigate a bounded task'}]},t=r.start('s',p);t.turnId='t';
 const hook=(id,tool_response='ok')=>r.hook({session_id:'s',turn_id:'t',hook_event_name:'PostToolUse',tool_use_id:id,tool_name:'shell',tool_response});return{r,t,p,hook,updates,calls:()=>calls};
}
test('new failures and progress remain eligible within the hard request budget',async()=>{
 const f=routeFixture();await f.r.routeStart(f.p);await f.hook('first');
 for(let i=0;i<10;i++){f.r.observe({method:'item/completed',params:{threadId:'s',item:{type:'agentMessage',text:'New contradiction at step '+i}}});await f.hook('next'+i,{exit_code:1});}
 assert.equal(f.calls(),6);assert.equal(f.t.current,'medium');assert.equal(f.updates.length,0);
});
test('unchanged automatic downgrade still gets reassessed and restores baseline when calls run out',async()=>{
 const f=routeFixture('low');await f.r.routeStart(f.p);await f.hook('a');await f.hook('b');await f.hook('c');await f.hook('d');
 assert.equal(f.calls(),4);assert.equal(f.t.current,'medium');assert(f.updates.some(p=>p.effort==='medium'));
});
test('mechanical progress reuses a lease; a changed or failed plan remains non-routine',()=>{
 assert(routineProgress('Verification check 3 passed; continuing the agreed verification plan.'));
 assert(routineProgress('第3项检查已通过，继续原计划。'));
 for(const s of ['Verification check 3 failed; continuing the agreed verification plan.','Verification check 3 passed; but a security failure remains.','第3项检查已通过，但发现新错误'])assert.equal(routineProgress(s),false);
});
function pilotFixture(t){
 const root=mkdtempSync(join(tmpdir(),'jev-admission-')),store=new Store({home:join(root,'private')});const requests=[];
 const pilot=new Pilot({store,key:'fixture',send:async p=>{requests.push(p);return{model:'fixture',answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>[id,choice(q,'pass')]))};}});t.after(()=>pilot.close());return{requests,call:input=>pilot.call({workspace:root,operation:'quality',input})};
}
test('oversized semantic quality work is rejected before judgment without fake passing or partial evaluation',async t=>{
 const f=pilotFixture(t);for(const content of ['x'.repeat(31000),'证据'.repeat(6000)]){
  const r=await f.call({content,rules:[{id:'a',text:'Check contradictions across the complete document'}]});assert.equal(r.verdict,'not_evaluated');assert.equal(r.reason,'INPUT_TOO_LARGE');assert.equal(r.evaluated,false);assert.deepEqual(r.checks,[]);
 }assert.equal(f.requests.length,0);
});
test('bounded quality checks use named evidence and preserve the complete source',async t=>{
 const f=pilotFixture(t),content='The total is unknown; do not state it is zero.';
 const r=await f.call({content,rules:[{id:'a',text:'Preserve uncertainty'}]});assert.equal(r.verdict,'passed');assert.equal(f.requests.length,1);assert.equal(f.requests[0].state.content,content);assert(!f.requests[0].state.task.includes(content));
});

import {createAutomation} from '../src/automation.mjs';
import {classificationPlan} from '../src/core.mjs';
test('automatic filtering respects an explicit two-call limit before starting three batches',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jev-batch-admission-'));let calls=0;
 const store=new Store({home:join(root,'private')});store.put(store.project(root),'config',{maxCalls:2},'settings');
 const automation=createAutomation({store,key:'fixture',send:async()=>{calls++;throw new Error('must not request');}});t.after(()=>automation.close());
 await automation.hook({cwd:root,session_id:'batch-test',turn_id:'t',hook_event_name:'UserPromptSubmit',prompt:'Find release entries relevant to session handling'});
 const result=await automation.hook({cwd:root,session_id:'batch-test',turn_id:'t',hook_event_name:'PostToolUse',tool_use_id:'read',tool_name:'shell',tool_response:Array.from({length:1500},(_,i)=>`Record ${i}: release note alpha beta`).join('\n')});
 assert.deepEqual(result,{});assert.equal(calls,0);
 const admissions=store.events(store.project(root)).filter(e=>e.kind==='evidence_admission');assert.equal(admissions.length,1);assert.equal(admissions[0].reason,'CALL_BUDGET');
});
test('batch planner preserves all representable records across question and byte limits',()=>{
 const items=Array.from({length:50},(_,i)=>({id:'i'+i,text:'bounded record'}));items.splice(25,0,{id:'large',text:'x'.repeat(31000)});
 const p=classificationPlan('fixture',items,'Classify',{yes:'yes',no:'no'});
 assert.deepEqual(p.oversized.map(x=>x.id),['large']);assert.deepEqual(p.batches.flat().map(x=>x.id),items.filter(x=>x.id!=='large').map(x=>x.id));assert(p.batches.every(x=>x.length<=24));
});
test('unchanged baseline does not block one delayed recovery, and persistent failure stays bounded',async()=>{
 let now=0;const f=routeFixture();f.r.clock=()=>now;await f.r.routeStart(f.p);let attempts=0;f.r.judge=async()=>{attempts++;throw Error('JEV_TIMEOUT');};await f.hook('fail');assert.equal(attempts,1);assert.equal(f.t.current,'medium');assert.equal(f.t.retryAt,15000);
 now=60000;await f.hook('later');assert.equal(attempts,2);assert.equal(f.t.retryAt,null);await f.hook('still-failing');assert.equal(attempts,2);assert.equal(f.updates.length,0);
});
test('a user-selected lowest supported effort needs no routing API, but automatic downgrades still do',async()=>{
 const f=routeFixture('low');f.p.effort='low';const t=f.r.start('s',f.p);t.turnId='t';await f.r.routeStart(f.p);await f.hook('a');assert.equal(f.calls(),0);assert.equal(t.current,'low');
 t.baseline='high';assert.equal(f.r.eligible(t),true);
 const g=routeFixture();g.r.supported.set('gpt-6-sol',['medium','high']);await g.r.routeStart(g.p);assert.equal(g.calls(),0);
});
