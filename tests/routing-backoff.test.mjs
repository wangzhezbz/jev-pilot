import test from 'node:test';import assert from 'node:assert/strict';import{Router,effortQuestion,horizonQuestion}from'../runtime/desktop/router.mjs';
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
function fixture(){let calls=0,time=100000,selected='medium',fail=false;const logs=[],updates=[];const r=new Router({coalesceMs:0,clock:()=>time,judge:async()=>{calls++;if(fail)throw Error('JEV_TIMEOUT');return{answer:choice(effortQuestion,selected),horizon:choice(horizonQuestion,'1')};},request:async(m,p)=>{updates.push(p);return{status:'applied'};},log:x=>logs.push(x)});r.supported.set('gpt-6-sol',['low','medium','high']);return{r,logs,updates,get calls(){return calls;},advance:ms=>time+=ms,select:x=>selected=x,fail:x=>fail=x};}
async function start(f,text='Investigate a task'){const p={threadId:'t',model:'gpt-6-sol',effort:'medium',cwd:'/p',input:[{type:'text',text}]},t=f.r.start('t',p);t.turnId='turn'+f.calls;await f.r.routeStart(p,t);return t;}
const hook=(f,id,response='observed result')=>{const t=f.r.turns.get('t');return f.r.hook({session_id:'t',turn_id:t.turnId,hook_event_name:'PostToolUse',tool_use_id:id,tool_name:'exec',tool_response:response});};
function complete(f){const t=f.r.turns.get('t');f.r.observe({method:'turn/completed',params:{threadId:'t',turn:{id:t.turnId,status:'completed'}}});}
test('a new task remains eligible after two completed no-change turns',async()=>{const f=fixture();for(let n=0;n<2;n++){await start(f);await hook(f,'read');complete(f);}const before=f.calls;f.select('low');const t=await start(f,'Only format the already verified result');assert.equal(f.calls,before+1);assert.equal(t.current,'low');});
test('a new phase after two no-change decisions can actually downshift',async()=>{const f=fixture();const t=await start(f);await hook(f,'read');f.r.observe({method:'item/completed',params:{threadId:'t',item:{type:'agentMessage',text:'Implementation and checks are complete; next only format the verified result.'}}});f.select('low');await hook(f,'checks','All required checks passed');assert.equal(t.current,'low');assert.equal(f.calls,3);assert.equal(f.updates.at(-1).effort,'low');});
test('an observed failure after two no-change decisions is reassessed within the existing ceiling',async()=>{const f=fixture();await start(f);await hook(f,'read');f.select('high');await hook(f,'failed',{exit_code:1,output:'New failure contradicts the previous assumption'});assert.equal(f.calls,3);assert.equal(f.r.turns.get('t').current,'medium');});
test('a transient outage following an unchanged decision still has one bounded recovery',async()=>{const f=fixture();const t=await start(f);f.fail(true);await hook(f,'offline');assert.notEqual(t.retryAt,null);const before=f.calls;await hook(f,'too-soon');assert.equal(f.calls,before);f.advance(15000);f.fail(false);f.select('low');await hook(f,'service-restored');assert.equal(f.calls,before+1);assert.equal(t.current,'low');assert.equal(t.recoveryAttempts,1);});
test('restoring reevaluation keeps the hard call cap and never leaves an expired downgrade',async()=>{const f=fixture();await start(f);await hook(f,'read');f.select('low');await hook(f,'phase');for(let i=0;i<15;i++)await hook(f,'f'+i,{exit_code:1});assert(f.calls<=6);assert.equal(f.r.turns.get('t').current,'medium');});

test('two unchanged baseline judgments reuse four boundaries then reassess',async()=>{
 const f=fixture(),t=await start(f);await hook(f,'first');assert.equal(t.horizonReason,'stable_baseline_spacing');
 f.select('low');for(let i=0;i<4;i++)await hook(f,'spaced'+i);
 assert.equal(f.calls,2);assert.equal(t.current,'medium');
 await hook(f,'eligible');assert.equal(f.calls,3);assert.equal(t.current,'low');assert.equal(t.horizon,1);
});
test('baseline spacing never hides elapsed leases or new user input',async()=>{
 for(const kind of ['expiry','input']){const f=fixture(),t=await start(f);await hook(f,'first');
 if(kind==='expiry')t.leaseUntil=Date.now()-1;else f.r.invalidate('t',[{type:'text',text:'A new failure needs investigation'}]);
 f.select('low');await hook(f,'urgent');assert.equal(f.calls,3);assert.equal(t.current,'low');}
});

async function stableBaseline(f){const t=await start(f);await hook(f,'a');assert.equal(f.calls,2);return t;}
test('stable baseline reduces short-run calls and preserves a later useful downgrade',async()=>{
 const f=fixture(),t=await stableBaseline(f);assert.equal(t.horizon,5);assert.equal(t.horizonReason,'stable_baseline_spacing');
 for(let i=0;i<4;i++)await hook(f,'stable'+i);
 assert.equal(f.calls,2);assert.equal(t.current,'medium');
 f.select('low');await hook(f,'later-easy-step');assert.equal(f.calls,3);assert.equal(t.current,'low');assert.equal(t.horizon,1);
 f.fail(true);await hook(f,'expired-downgrade');assert.equal(t.current,'medium');
});
test('stable baseline spacing is interrupted by failure, new phase, input or expiry',async()=>{
 for(const kind of ['failure','phase','input','expiry']){
  const f=fixture(),t=await stableBaseline(f);
  if(kind==='phase')f.r.observe({method:'item/completed',params:{threadId:'t',item:{type:'agentMessage',text:'New phase: independently verify the changed behavior.'}}});
  if(kind==='input')f.r.invalidate('t',[{type:'text',text:'Inspect a different requirement'}]);
  if(kind==='expiry')t.leaseUntil=Date.now()-1;
  await hook(f,'changed',kind==='failure'?{exit_code:1}:'observed result');
  assert.equal(f.calls,3,kind);
  if(kind!=='expiry')assert.equal(t.noBenefitHits,1,kind);
 }
});
test('keep at baseline can space but invalid horizon and manual changes cannot inherit the streak',async()=>{
 const f=fixture(),t=await stableBaseline(f);f.select('keep');t.leaseUntil=0;await hook(f,'keep');assert.equal(t.horizon,5);
 f.r.renew(t,{answer:choice(effortQuestion,'keep'),horizon:{}});assert.equal(t.horizon,1);
 const control=f.r.beginSettingsUpdate({threadId:'t',turnId:t.turnId,effort:'high'});f.r.finishSettingsUpdate(control,{status:'applied'});
 assert.equal(t.noBenefitHits,0);assert.equal(t.baseline,'high');assert.equal(t.lease,0);
});

import{effortTransportFlags}from'../runtime/desktop/bridge.mjs';
test('native cache transport is version bounded and respects explicit feature configuration',()=>{
 for(const version of ['codex-cli 0.155.0-alpha.16.3','codex-cli 0.155.0-alpha.16.4']) {
  assert.deepEqual(effortTransportFlags(version),['--enable','reasoning_effort_override']);
  for(const args of [['--disable','reasoning_effort_override'],['-c','features.reasoning_effort_override=false'],['--enable','reasoning_effort_override'],['--disable=reasoning_effort_override'],['-c','features.reasoning_effort_override = false'],['--disable','code_mode,reasoning_effort_override']])assert.deepEqual(effortTransportFlags(version,args),[]);
 }
 for(const v of [null,'codex-cli 0.155.0-alpha.9.2','codex-cli 0.155.0-alpha.16.5','codex-cli 0.156.0'])assert.deepEqual(effortTransportFlags(v),[]);
});
