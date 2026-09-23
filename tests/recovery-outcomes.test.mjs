import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Router,effortQuestion,horizonQuestion} from '../runtime/desktop/router.mjs';
import {Store} from '../src/core.mjs';import {createAutomation} from '../src/automation.mjs';
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
const answer=()=>({answer:choice(effortQuestion,'medium'),horizon:choice(horizonQuestion,'5')});
async function fixture({error='JEV_TIMEOUT',alwaysFail=false,maxCalls=6}={}){
 let time=1000,calls=0;const logs=[],updates=[];
 const r=new Router({clock:()=>time,coalesceMs:0,maxCalls,judge:async()=>{calls++;if(alwaysFail||calls===1)throw Error(error);return answer();},request:async(m,p)=>{updates.push(p);return{status:'applied'};},log:e=>logs.push(e)});
 r.supported.set('gpt-6-astra',['low','medium','high']);const p={threadId:'thread',model:'gpt-6-astra',effort:'high',input:[{type:'text',text:'Investigate a parser failure'}]},t=r.start('thread',p);await r.routeStart(p,t);r.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
 const hook=(id,extra={})=>r.hook({session_id:'thread',turn_id:'turn',hook_event_name:'PostToolUse',tool_use_id:id,tool_name:'Bash',tool_response:'ok',...extra});
 return{r,t,hook,logs,updates,calls:()=>calls,advance:ms=>time+=ms};
}
test('transient first-step timeout recovers once at a later boundary after cooldown',async()=>{
 const s=await fixture();await s.hook('early');s.advance(14999);await s.hook('before');assert.equal(s.calls(),1);
 s.advance(1);await s.hook('ready');assert.equal(s.calls(),2);assert.equal(s.t.current,'medium');assert.equal(s.t.recoveryAttempts,1);assert.equal(s.logs.filter(x=>x.kind==='routing_recovery').length,1);
});
test('persistent network failure gets at most one delayed recovery attempt',async()=>{
 const s=await fixture({alwaysFail:true});s.advance(15000);await s.hook('retry');s.advance(60000);
 s.r.invalidate('thread',[{type:'text',text:'New failure'}]);await s.hook('failure',{tool_response:{exit_code:1}});assert.equal(s.calls(),2);assert.equal(s.t.current,'high');assert.equal(s.t.retryAt,null);
});
test('authentication, invalid answers, shared budgets and unknown native state never retry',async()=>{
 for(const error of ['JEV_AUTH','INVALID_ANSWER','TASK_CALL_BUDGET','JEV_TLS']){const s=await fixture({error});s.advance(60000);await s.hook('later');assert.equal(s.calls(),1,error);}
 const s=await fixture();s.t.settingsUncertain=true;s.advance(60000);await s.hook('later');assert.equal(s.calls(),1);
});
test('failure and new input do not bypass cooldown, exhausted totals or interruption',async()=>{
 const s=await fixture();s.r.invalidate('thread',[{type:'text',text:'new evidence'}]);await s.hook('early',{tool_response:{exit_code:1}});assert.equal(s.calls(),1);
 s.advance(15000);s.r.stop('thread');await s.hook('stopped');assert.equal(s.calls(),1);
 const limited=await fixture({maxCalls:1});limited.advance(60000);await limited.hook('later');assert.equal(limited.calls(),1);
});
test('failed later judgment restores baseline before waiting for recovery',async()=>{
 const s=await fixture();s.t.unavailable=false;s.t.current='low';s.t.retryAt=null;s.t.lease=0;
 s.r.judge=async()=>{throw Error('JEV_CONNECT');};await s.hook('failed');assert.equal(s.t.current,'high');assert.equal(s.updates.at(-1).effort,'high');assert.equal(s.t.retryAt,16000);
});
test('pending recovery invalidated by new input cannot apply a stale result',async()=>{
 const s=await fixture();let resolve,enter;const entered=new Promise(r=>enter=r);
 s.r.judge=async()=>{enter();return new Promise(r=>resolve=r);};s.advance(15000);const job=s.hook('retry');await entered;s.r.invalidate('thread',[{type:'text',text:'Changed goal'}]);resolve(answer());await job;assert.equal(s.updates.length,0);
});
test('repeated in-process continuations preserve goal; new task, scope and expiry replace history',()=>{
 let clock=1000;const r=new Router({clock:()=>clock,request:async()=>{},judge:async()=>{}});const base={cwd:'/a',input:[{type:'text',text:'Build parser'}]};
 let t=r.start('s',base);t.completed=true;t.turnId='a';t.progress=['Checks ready'];
 for(const prompt of ['继续','重启了','开始吧']){t=r.start('s',{...base,input:[{type:'text',text:prompt}]});assert.equal(t.previousTurn.task,'Build parser');assert.equal(t.previousTurn.requiresReview,true);t.completed=true;}
 t=r.start('s',{...base,input:[{type:'text',text:'Write a different app'}]});t.completed=true;
 t=r.start('s',{...base,input:[{type:'text',text:'继续'}]});assert.equal(t.previousTurn.task,'Write a different app');t.completed=true;
 clock+=86400001;t=r.start('s',{...base,input:[{type:'text',text:'继续'}]});assert.equal(t.previousTurn,undefined);t.completed=true;
 t=r.start('s',{...base,cwd:'/b',input:[{type:'text',text:'继续'}]});assert.equal(t.previousTurn,undefined);
});
function autoFixture(t,{fail=false,exclude=false}={}){
 const root=mkdtempSync(join(tmpdir(),'jev-outcomes-')),store=new Store({home:join(root,'private')});let calls=0,time=1000;
 const auto=createAutomation({store,key:'fixture',clock:()=>time,send:async p=>{calls++;if(fail)throw Object.assign(Error('unavailable'),{code:'JEV_TIMEOUT'});return{model:'fixture',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.keys(p.questions).map((id,i)=>{const c=exclude&&i>0?'exclude':'keep';return[id,{type:'choice',choice:c,probabilities:{keep:c==='keep'?1:0,review:0,exclude:c==='exclude'?1:0}}]}))};}});
 t.after(async()=>auto.close());const base={cwd:root,session_id:'s',turn_id:'a'};const text='Important error evidence for the task. '.repeat(700)+'\n'+Array.from({length:80},(_,i)=>'entry '+i+' '+('evidence '.repeat(12))).join('\n');
 const start=(prompt='Investigate the observed evidence',turn='a')=>auto.hook({...base,turn_id:turn,hook_event_name:'UserPromptSubmit',prompt});
 const hook=(id,extra={})=>auto.hook({...base,hook_event_name:'PostToolUse',tool_use_id:id,tool_name:'Bash',tool_response:text,...extra});
 return{auto,store,root,start,hook,calls:()=>calls,advance:ms=>time+=ms,events:()=>store.events(store.project(root),100)};
}
test('no-benefit result is measured and next same-source call passes through during cooldown',async t=>{
 const f=autoFixture(t);await f.start();assert.deepEqual(await f.hook('1'),{});assert.equal(f.calls(),1);
 const outcome=f.events().find(x=>x.kind==='automatic_output_result');assert.equal(outcome.reason,'insufficient_reduction');assert(outcome.retainedRatio>=.8);assert.equal(outcome.nativeTokenSavings,null);
 assert.deepEqual(await f.hook('2'),{});assert.equal(f.calls(),1);assert(f.events().some(x=>x.reason==='no_benefit_cooldown'));
 f.advance(60000);await f.hook('3');assert.equal(f.events().filter(x=>x.kind==='automatic_output_admission'&&x.reason==='eligible').length,2);assert(f.events().some(x=>x.kind==='cache_hit'));assert.equal(f.calls(),1);
});
test('cooldown survives turn reset but never crosses tasks, tool sources or projects',async t=>{
 const f=autoFixture(t);await f.start();await f.hook('1');await f.start(undefined,'b');await f.hook('2',{turn_id:'b'});assert.equal(f.calls(),1);
 await f.hook('other-tool',{turn_id:'b',tool_name:'OtherTextTool'});assert.equal(f.calls(),2);
 await f.start('A different investigation','c');await f.hook('new-goal',{turn_id:'c'});assert.equal(f.calls(),3);
 const other=mkdtempSync(join(tmpdir(),'jev-outcomes-other-'));await f.auto.hook({cwd:other,session_id:'s',turn_id:'d',hook_event_name:'UserPromptSubmit',prompt:'A different investigation'});await f.hook('new-project',{cwd:other,turn_id:'d'});assert.equal(f.calls(),4);
});
test('failed filtering is recorded without pretending it had no benefit or setting benefit cooldown',async t=>{
 const f=autoFixture(t,{fail:true});await f.start();await f.hook('1');const e=f.events().find(x=>x.kind==='automatic_output_result');assert.equal(e.reason,'degraded');await f.hook('2');assert.equal(f.calls(),2);assert(!f.events().some(x=>x.reason==='no_benefit_cooldown'));
});
test('successful filtering records actual wrapped bytes and keeps original recoverable',async t=>{
 const f=autoFixture(t,{exclude:true});await f.start();const input=Array.from({length:350},(_,i)=>'sample '+i+' '+('x'.repeat(80))).join('\n');const result=await f.hook('1',{tool_response:input});assert.equal(result.continue,false);
 const e=f.events().find(x=>x.kind==='automatic_output_result');assert.equal(e.reason,'applied');assert.equal(e.retainedBytes,Buffer.byteLength(result.stopReason));assert(e.retainedRatio<.8);assert(f.store.get(f.store.project(f.root),'artifact',e.artifactId));
});
test('a slow filter from an older turn cannot replace new-turn output or set its cooldown',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jev-stale-filter-')),store=new Store({home:join(root,'private')});let release,enter;const entered=new Promise(r=>enter=r);
 const auto=createAutomation({store,key:'fixture',send:p=>{enter();return new Promise(r=>release=()=>r({model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>[id,{type:'choice',choice:'keep',probabilities:{keep:1,review:0,exclude:0}}]))}));}});t.after(async()=>auto.close());
 const base={cwd:root,session_id:'s',turn_id:'a'};await auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'Inspect logs'});
 const job=auto.hook({...base,hook_event_name:'PostToolUse',tool_use_id:'one',tool_name:'Bash',tool_response:('ordinary line xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n').repeat(400)});await entered;
 await auto.hook({...base,turn_id:'b',hook_event_name:'UserPromptSubmit',prompt:'New task'});release();assert.deepEqual(await job,{});
 const events=store.events(store.project(root));assert(events.some(e=>e.kind==='automatic_output_result'&&e.reason==='stale_turn'));assert.equal(store.list(store.project(root),'automatic_filter_cooldown').length,0);
});
