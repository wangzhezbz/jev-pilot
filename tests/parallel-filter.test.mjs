import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store,Judge,loadConfig} from '../src/core.mjs';import {createAutomation} from '../src/automation.mjs';
import {metrics} from '../src/workflows.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
const response=(p,choice='keep')=>({model:'fixture',usage:{input_tokens:10,output_tokens:1},answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>[id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}]))});
function fixture(t){const root=mkdtempSync(join(tmpdir(),'jev-parallel-')),store=new Store({home:join(root,'private')}),project=store.project(root);t.after(()=>store.close());return{root,store,project,config:{...loadConfig(store,project),cacheMs:0}};}
const items=Array.from({length:50},(_,i)=>({id:'i'+i,text:'Record '+i}));
const rubric={keep:'Relevant',review:'Unclear',exclude:'Unrelated'};
test('bounded batch workers overlap at most two requests and preserve source order after out-of-order replies',async t=>{
 const f=fixture(t),pending=new Map();let active=0,peak=0;
 const judge=new Judge({...f,key:'fixture',concurrency:2,send:p=>new Promise(resolve=>{active++;peak=Math.max(peak,active);pending.set(p.state.items[0].id,()=>{active--;resolve(response(p));});})});
 const job=judge.classify(items,'Inspect records',rubric);await tick();assert.deepEqual([...pending.keys()],['i0','i24']);
 pending.get('i24')();await tick();assert(pending.has('i48'));pending.get('i48')();pending.get('i0')();
 const results=await job;assert.equal(peak,2);assert.equal(judge.calls,3);assert.deepEqual(results.map(x=>x.id),items.map(x=>x.id));assert(results.every(x=>x.source==='jev'));
});
test('parallel workers never exceed shared or per-operation call ceilings',async t=>{
 for(const type of ['taskMaxCalls','maxCalls']){
  const f=fixture(t);let calls=0;const judge=new Judge({...f,config:{...f.config,[type]:1},key:'fixture',concurrency:2,send:async p=>{calls++;await tick();return response(p);}});
  const results=await judge.classify(items,'Inspect records',rubric);assert.equal(calls,1);assert.equal(results.length,50);assert(results.slice(24).every(x=>x.source==='fallback'));
 }
});
test('cancellation stops queued batches and remains unknown usage rather than a service failure',async t=>{
 const f=fixture(t),controller=new AbortController();let started=0;
 const judge=new Judge({...f,key:'fixture',concurrency:2,signal:controller.signal,send:(p,key,{signal})=>new Promise((resolve,reject)=>{started++;signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'CANCELLED'})),{once:true});})});
 const job=judge.classify(items,'Inspect records',rubric);await tick();controller.abort();const results=await job;assert.equal(started,2);assert(results.every(x=>x.reason==='CANCELLED'));
 const m=metrics(f);assert.equal(m.jev.cancellations,2);assert.equal(m.jev.failures,0);assert.equal(m.jev.missingUsage,2);assert(f.store.list(f.project,'circuit').every(c=>c.failures===0));
});
const log=Array.from({length:360},(_,i)=>`10:04 inventory-reporter: warehouse catalog shard ${i} processed 25 unchanged product labels.`).join('\n');
async function autoFixture(){const root=mkdtempSync(join(tmpdir(),'jev-parallel-auto-')),store=new Store({home:join(root,'private')});let calls=0,aborted=0;
 const auto=createAutomation({store,key:'fixture',send:(p,key,{signal})=>new Promise((resolve,reject)=>{calls++;signal.addEventListener('abort',()=>{aborted++;reject(Object.assign(Error('cancelled'),{code:'CANCELLED'}));},{once:true});})});
 const base={cwd:root,session_id:'s',turn_id:'a'},prompt=extra=>auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'Inspect checkout observations',...extra}),hook=extra=>auto.hook({...base,hook_event_name:'PostToolUse',tool_use_id:'read',tool_name:'shell',tool_response:log,...extra});
 return{auto,store,root,prompt,hook,calls:()=>calls,aborted:()=>aborted};}
test('new prompt cancels old filtering and late old-turn tools cannot spend on the new goal',async()=>{
 const f=await autoFixture();try{await f.prompt();const job=f.hook();await tick();assert.equal(f.calls(),2);await f.prompt({turn_id:'b',prompt:'A changed task'});assert.deepEqual(await job,{});assert.equal(f.aborted(),2);assert.deepEqual(await f.hook({tool_use_id:'late'}),{});assert.equal(f.calls(),2);}finally{await f.auto.close();}
});
test('steering or stopping cancels filters and suppresses further work until a new prompt',async()=>{
 const f=await autoFixture();try{await f.prompt();const job=f.hook();await tick();f.auto.cancel('s');assert.deepEqual(await job,{});assert.equal(f.aborted(),2);assert.deepEqual(await f.hook({tool_use_id:'late'}),{});assert.equal(f.calls(),2);
  await f.prompt({turn_id:'b'});const next=f.hook({turn_id:'b'});await tick();assert.equal(f.calls(),4);f.auto.cancel('s');await next;
 }finally{await f.auto.close();}
});
test('closing automation aborts and drains active work before closing its database',async()=>{
 const f=await autoFixture();await f.prompt();const job=f.hook();await tick();await f.auto.close();assert.deepEqual(await job,{});assert.equal(f.aborted(),2);
});

import {PassThrough} from 'node:stream';import {connect} from 'node:net';import {runBridge} from '../runtime/desktop/bridge.mjs';
test('desktop bridge cancels filters immediately on start, steer and interrupt', {timeout:5000}, async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-bridge-cancel-')),store=new Store({home:join(root,'private')}),input=new PassThrough(),output=new PassThrough();output.resume();let started=0,aborted=0;
 const bridge=await runBridge({realBin:process.execPath,args:['-e','process.stdin.resume()','--'],input,output,judge:async()=>{throw Error('no routing');},automation:{store,key:'fixture',send:(p,key,{signal})=>new Promise((resolve,reject)=>{started++;signal.addEventListener('abort',()=>{aborted++;reject(Object.assign(Error('cancelled'),{code:'CANCELLED'}));},{once:true});})}});
 const call=p=>new Promise((resolve,reject)=>{const socket=connect(bridge.socketPath,()=>socket.write(JSON.stringify(p)+'\n'));let raw='';socket.on('data',b=>raw+=b);socket.on('end',()=>{try{resolve(JSON.parse(raw));}catch(e){reject(e);}});socket.on('error',reject);});
 try{for(const [i,method]of ['turn/steer','turn/interrupt','turn/start'].entries()){
  const base={cwd:root,session_id:'s',turn_id:'t'+i};await call({...base,hook_event_name:'UserPromptSubmit',prompt:'Investigate checkout observations'});
  const job=call({...base,hook_event_name:'PostToolUse',tool_name:'shell',tool_use_id:'read',tool_response:log});
  while(started<(i+1)*2)await tick();input.write(JSON.stringify({id:i+1,method,params:{threadId:'s',input:[{type:'text',text:'Changed task'}]}})+'\n');await job;assert.equal(aborted,(i+1)*2);
 }}finally{await bridge.cleanup();input.end();bridge.child.kill();}
});
