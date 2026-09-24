import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pilot} from '../src/pilot.mjs';
import {Store} from '../src/core.mjs';
const answer=p=>({model:p.model,usage:{input_tokens:10,output_tokens:2},answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>{
 const c=['exclude','defer','skip','routine','pass'].find(c=>Object.hasOwn(q.criteria,c));
 return[id,{type:'choice',choice:c,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===c)]))}];
}))});
function fixture(t,config={}){
 const root=mkdtempSync(join(tmpdir(),'jev-workflow-efficiency-')),store=new Store({home:join(root,'private')}),project=store.project(root),requests=[];
 store.put(project,'config',config,'settings');
 const pilot=new Pilot({store,key:'fixture',send:async p=>{requests.push(p);return answer(p);}});t.after(()=>pilot.close());
 return{root,store,project,pilot,requests,call:(operation,input={},options)=>pilot.call({workspace:root,operation,input},options),configure:patch=>store.put(project,'config',{...config,...patch},'settings')};
}
const blocks=()=>[{id:'call',callId:'old',role:'tool_call',content:'Read completed catalog',readOnly:true,verified:true},{id:'result',callId:'old',role:'tool_result',content:'Unrelated old catalog',status:'completed'},{id:'latest',role:'user',content:'Current billing task'}];
const input=()=>({goal:'Find billing evidence',session:'same',blocks:blocks(),preserveRecent:1});
test('position-only changes reuse judgment; original metadata and whole exchanges are preserved',async t=>{
 const f=fixture(t),a=input();a.blocks[0].index=777;
 await f.call('compact',a);
 const b={...a,blocks:[{id:'prefix',role:'system',content:'Preserve billing constraints'},...a.blocks]};
 const r=await f.call('compact',b);assert.equal(f.requests.length,1);assert.equal(r.reusedJudgments,1);assert.deepEqual(r.omittedCallIds,['old']);
 assert.equal(JSON.parse(f.requests[0].state.items[0].text)[0].index,777);
 assert.deepEqual((await f.call('recall',{artifactId:r.originalId})).items.map(x=>x.id),b.blocks.map(x=>x.id));
 b.blocks[1]={...b.blocks[1],index:778};await f.call('compact',b);assert.equal(f.requests.length,2);
});
test('model, goal, session and source metadata invalidate compaction judgments',async t=>{
 const f=fixture(t),a=input();await f.call('compact',a);
 f.configure({model:'another-model'});await f.call('compact',a);
 await f.call('compact',{...a,goal:'Another goal'});await f.call('compact',{...a,session:'another'});
 const b=input();b.blocks[1].sourceHash='changed';await f.call('compact',b);
 // A new session invalidates the ledger, but an identical request may use the normal response cache.
 assert.equal(f.requests.length,4);
});
test('disabled, keyless, cancelled and shadow compaction never applies a cached exclusion',async t=>{
 for(const mode of ['disabled','keyless','cancelled','shadow']){
  const f=fixture(t),a=input();await f.call('compact',a);
  if(mode==='disabled')f.configure({enabled:false});if(mode==='keyless')f.pilot.key=null;
  if(mode==='shadow')f.configure({evidenceMode:'shadow'});
  const signal=mode==='cancelled'?AbortSignal.abort():undefined;
  const r=await f.call('compact',a,{signal});assert.deepEqual(r.omittedCallIds,[],mode);assert.equal(f.requests.length,1,mode);
 }
});
test('expired and disabled caches reevaluate; failed reevaluation cannot reuse stale decisions',async t=>{
 const f=fixture(t),a=input();await f.call('compact',a);
 const saved=f.store.list(f.project,'compaction')[0];saved.decisions.old.expiresAt=0;f.store.put(f.project,'compaction',saved,saved.id);
 // Expire both caches without changing task data or resetting production budgets.
 f.store.db.prepare('UPDATE cache SET expires=0').run();
 await f.call('compact',a);assert.equal(f.requests.length,2);
 f.configure({cacheMs:0});await f.call('compact',a);assert.equal(f.requests.length,3);
 f.pilot.send=async()=>{throw Object.assign(new Error('offline'),{code:'UNAVAILABLE'});};
 const r=await f.call('compact',a);assert.equal(r.degraded,true);assert.deepEqual(r.proposedOmittedCallIds,[]);assert.deepEqual(r.omittedCallIds,[]);
});
test('recent and failed exchanges stay protected even after a cached exclusion',async t=>{
 const f=fixture(t),a=input();await f.call('compact',a);
 assert.deepEqual((await f.call('compact',{...a,preserveRecent:2})).omittedCallIds,[]);
 a.blocks[1].status='failed';assert.deepEqual((await f.call('compact',a)).omittedCallIds,[]);assert.equal(f.requests.length,1);
});
test('mandatory tools and tests incur no classification requests and keep explicit policy provenance',async t=>{
 const f=fixture(t);
 const tools=await f.call('select_tools',{goal:'Use tools',tools:[{id:'a',text:'Required tool'}],required:['a']});
 assert.equal(f.requests.length,0);assert.equal(tools.selected[0].id,'a');assert.equal(tools.judgments[0].source,'policy');
 const r=await f.call('review',{goal:'Review',changes:[],tests:[{id:'a',text:'Required',required:true},{id:'b',text:'Changed',changed:true},{id:'c',text:'Explicit'}],required:['c']});
 assert.equal(f.requests.length,0);assert.deepEqual(r.run,['a','b','c']);assert(r.judgments.every(j=>j.source==='policy'));
});
test('optional judgments retain original ID order, mandatory tests run and failures keep uncertain tests',async t=>{
 const f=fixture(t),a={goal:'Review',changes:[],tests:[{id:'a',text:'Required',required:true},{id:'b',text:'Optional'},{id:'c',text:'Changed',changed:true}]};
 const r=await f.call('review',a);assert.deepEqual(r.judgments.map(j=>j.id),['a','b','c']);assert.deepEqual(r.run,['a','c']);assert.deepEqual(f.requests[0].state.items.map(i=>i.id),['b']);
 f.configure({cacheMs:0});f.pilot.send=async()=>{throw Error('offline');};const failed=await f.call('review',a);assert.deepEqual(failed.run,['a','b','c']);assert.deepEqual(failed.deferred,[]);
});
for(const operation of ['review','quality'])test(`${operation} independent checks overlap with maximum two in-flight requests`,async t=>{
 const f=fixture(t,{cacheMs:0});let active=0,peak=0;const releases=[];
 f.pilot.send=async p=>{active++;peak=Math.max(peak,active);await new Promise(r=>releases.push(r));active--;return answer(p);};
 const data=operation==='review'?{goal:'Review',changes:[{id:'c',text:'Change'}],tests:[{id:'t',text:'Optional'}]}:{content:'Source',rules:[{id:'r',text:'Check'}],translations:[{id:'zh',text:'原文'}]};
 const pending=f.call(operation,data);await new Promise(r=>setImmediate(r));assert.equal(releases.length,2);for(const release of releases)release();
 const r=await pending;assert.equal(peak,2);assert.equal(operation==='review'?r.risks.length:r.checks.length,1);
});
test('tight shared wait budget stays sequential; call cap still applies and fallback runs tests',async t=>{
 const f=fixture(t,{cacheMs:0,taskMaxWaitMs:6000});let active=0,peak=0;
 f.pilot.send=async p=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return answer(p);};
 const a={goal:'Review',changes:[{id:'c',text:'Change'}],tests:[{id:'t',text:'Optional'}]};
 await f.call('review',a);assert.equal(peak,1);
 f.configure({cacheMs:0,maxCalls:1});const r=await f.call('review',a);assert.deepEqual(r.run,['t']);assert.equal(r.judgments[0].reason,'CALL_BUDGET');
});
test('large independent classifications remain bounded to two concurrent requests',async t=>{
 const f=fixture(t,{cacheMs:0});let active=0,peak=0,calls=0;
 f.pilot.send=async p=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;return answer(p);};
 const rows=prefix=>Array.from({length:49},(_,i)=>({id:prefix+i,text:'Bounded candidate'}));
 const r=await f.call('review',{goal:'Review',changes:rows('c'),tests:rows('t')});assert.equal(peak,2);assert.equal(calls,6);assert.equal(r.risks.length,49);assert.equal(r.judgments.length,49);
});
test('cancelling parallel checks retains optional tests and releases both reservations',async t=>{
 const f=fixture(t,{cacheMs:0}),controller=new AbortController();
 f.pilot.send=async(p,key,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{code:'CANCELLED'})),{once:true}));
 const pending=f.call('review',{goal:'Review',changes:[{id:'c',text:'Change'}],tests:[{id:'t',text:'Optional'}]},{signal:controller.signal});
 await new Promise(r=>setImmediate(r));controller.abort();const r=await pending;
 assert.deepEqual(r.run,['t']);assert.equal(r.risks[0].reason,'CANCELLED');assert.equal(r.judgments[0].reason,'CANCELLED');
 assert(f.store.list(f.project,'task_budget').every(b=>Object.keys(b.reservations).length===0));
});
