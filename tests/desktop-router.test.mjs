import test from 'node:test';
import assert from 'node:assert/strict';
import {Router,select,redact,effortQuestion,horizonQuestion,selectedHorizon,compact,SUPPORTED_MODELS,usageCounts} from '../runtime/desktop/router.mjs';
import {proxyEnvironment} from '../runtime/desktop/bootstrap.mjs';
import {summarize} from '../runtime/desktop/report.mjs';
import {runtimeFingerprint} from '../runtime/desktop/bridge.mjs';
const answer=(choice,confidence=1)=>({type:'choice',choice,confidence,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k===choice?1:0]))});
// These fixtures exercise budgets and leases independently; production admission is
// covered with its default limit in benefit-admission.test.mjs.
function setup(options={}){
 const calls=[],logs=[];const router=new Router({coalesceMs:0,judge:async()=>({answer:answer('low'),model:'fixture',inputTokens:10}),request:async(method,params)=>{calls.push({method,params});return{status:'applied'};},log:x=>logs.push(x),...options});
 router.supported.set('gpt-6-astra',['low','medium','high','xhigh']);
 router.start('thread',{model:'gpt-6-astra',effort:'high',input:[{type:'text',text:'Format verified results.'}]});
 router.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
 return{router,calls,logs,p:{session_id:'thread',turn_id:'turn',model:'gpt-6-astra',hook_event_name:'PostToolUse',tool_use_id:'a',tool_name:'Bash',tool_response:'ok'}};
}
test('waits for native acknowledgment before releasing the tool hook',async()=>{
 let release,called;const entered=new Promise(r=>called=r);const s=setup({request:async()=>{called();return new Promise(r=>release=r);}});
 let done=false;const result=s.router.hook(s.p).then(()=>done=true);await entered;assert.equal(done,false);release({status:'applied'});await result;assert.equal(s.router.turns.get('thread').current,'low');
});
test('rejects stale turn and wrong model without calling Jev',async()=>{
 let count=0;const s=setup({judge:async()=>count++});await s.router.hook({...s.p,turn_id:'old'});await s.router.hook({...s.p,model:'other'});assert.equal(count,0);
});
test('an interrupted in-flight decision cannot change settings',async()=>{
 let release,entered;const ready=new Promise(r=>entered=r);const s=setup({judge:async()=>{entered();return new Promise(r=>release=r);}});
 const result=s.router.hook(s.p);await ready;s.router.stop('thread');release({answer:answer('low')});await result;assert.equal(s.calls.length,0);
});
test('parallel completions coalesce into one decision and both wait',async()=>{
 let release,count=0;const s=setup({judge:async()=>{count++;return new Promise(r=>release=r);}});
 const a=s.router.hook(s.p),b=s.router.hook({...s.p,tool_use_id:'b'});await new Promise(r=>setImmediate(r));assert.equal(count,1);release({answer:answer('low')});await Promise.all([a,b]);assert.equal(s.calls.length,1);
});
test('valid choices apply without an uncalibrated confidence threshold',()=>{
 for(const [choice,confidence,probability] of [['low',.88,.90],['medium',.41,.50],['xhigh',.26,.38]]){
  const a={...answer(choice,confidence),probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k===choice?probability:(1-probability)/5]))};
  assert.equal(select(a,'high',['low','medium','high','xhigh']),choice);
 }
});
test('malformed, unsupported, non-argmax and keep retain current',()=>{
 assert.equal(select(answer('low',NaN),'high',['low','high']),'high');
 assert.equal(select(answer('max'),'high',['low','high']),'high');
 assert.equal(select({...answer('low'),choice:'medium'},'high',['low','medium','high']),'high');
 assert.equal(select({...answer('low'),probabilities:{low:1}},'high',['low','high']),'high');
 assert.equal(select(answer('keep'),'high',['low','high']),'high');
});
test('Jev unavailable and runtime unavailable keep the existing setting',async()=>{
 let calls=0;const a=setup({judge:async()=>{calls++;throw new Error('TIMEOUT');}});await a.router.hook(a.p);a.router.turns.get('thread').lastAt=0;await a.router.hook({...a.p,tool_use_id:'again'});assert.equal(calls,1);assert.equal(a.calls.length,0);assert.equal(a.router.turns.get('thread').current,'high');
 const b=setup({request:async()=>({status:'targetUnavailable'})});await b.router.hook(b.p);assert.equal(b.router.turns.get('thread').current,'high');
});
test('new input invalidates a pending recommendation',async()=>{
 let release;const s=setup({judge:async()=>new Promise(r=>release=r)});const p=s.router.hook(s.p);await new Promise(r=>setImmediate(r));s.router.invalidate('thread');release({answer:answer('low')});await p;assert.equal(s.calls.length,0);
});
test('first inference is not falsely routed through UserPromptSubmit',async()=>{
 let count=0;const s=setup({judge:async()=>count++});await s.router.hook({...s.p,hook_event_name:'UserPromptSubmit'});assert.equal(count,0);
});
test('bounded calls and duplicate hooks never add requests',async()=>{
 let judgments=0;const s=setup({maxCalls:1,judge:async()=>{judgments++;return{answer:answer('low')};}});
 await s.router.routeStart({threadId:'thread'});await s.router.hook(s.p);await s.router.hook(s.p);await s.router.hook({...s.p,tool_use_id:'b'});
 assert.equal(judgments,1);assert.deepEqual(s.calls.map(x=>x.params.effort),['high']);
});
test('credentials are removed before task state is shared',()=>{
 const text=redact('token=secretvalue apikey_not_a_real_secret_123 Bearer abc.def sk-notarealkey123456','secretvalue');assert(!text.includes('secretvalue'));assert(!text.includes('apikey_'));assert(!text.includes('abc.def'));assert(!text.includes('sk-notareal'));
});
test('GUI bootstrap adopts enabled system HTTP proxies without changing existing variables',()=>{
 const system='  HTTPSEnable : 1\n  HTTPSProxy : 127.0.0.1\n  HTTPSPort : 10809\n';
 const fresh=proxyEnvironment({},system);assert.equal(fresh.HTTPS_PROXY,'http://127.0.0.1:10809');assert.equal(fresh.JEV_NETWORK_MODE,'system_proxy');
 const original=proxyEnvironment({https_proxy:'http://existing:123'},system);assert.equal(original.https_proxy,'http://existing:123');assert.equal(original.HTTPS_PROXY,undefined);
 assert.equal(proxyEnvironment({},system.replace('10809','99999')).HTTPS_PROXY,undefined);
 assert.equal(proxyEnvironment({},system.replace('Enable : 1','Enable : 0')).HTTPS_PROXY,undefined);
});
test('start routing supports each requested model without replacing model or mode settings',async()=>{
 for(const model of SUPPORTED_MODELS){
  const s=setup();s.router.supported.set(model,['low','medium','high','max']);
  const params={threadId:'thread',model,effort:'high',input:[],collaborationMode:{mode:'default',settings:{model,reasoning_effort:'high',developer_instructions:'unchanged'}}};
  const t=s.router.start('thread',params),r=await s.router.routeStart(params,t);
  assert.equal(r.model,model);assert.equal(r.effort,'low');assert.equal(params.effort,'high');
  assert.equal(r.collaborationMode.settings.reasoning_effort,'low');assert.equal(r.collaborationMode.settings.developer_instructions,'unchanged');
  assert.equal(s.calls.length,0);assert.equal(s.logs.length,0);
  s.router.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'new'}}});
  assert.equal(s.logs[0].status,'start_forwarded');assert.equal(s.logs[0].turnId,'new');
 }
});
test('unknown model or missing metadata cannot route the start',async()=>{
 const s=setup({judge:async()=>{throw new Error('MUST_NOT_CALL');}});
 for(const model of ['unknown','gpt-5.6-luna']){
  const p={threadId:'other',model,effort:'high'},t=s.router.start('other',p);
  assert.equal(await s.router.routeStart(p,t),p);assert.equal(t.calls,0);
 }
});
test('start recommendation becomes stale on interruption or steering',async()=>{
 for(const action of ['stop','invalidate']){
  let release;const s=setup({judge:async()=>new Promise(r=>release=r)});
  const params={threadId:'thread',model:'gpt-6-astra',effort:'high'};
  const pending=s.router.routeStart(params);s.router[action]('thread');release({answer:answer('low')});
  assert.equal(await pending,params);assert.equal(s.router.turns.get('thread').startDecision,undefined);
 }
});
test('explicit four-boundary fallback rechecks at fourth completion',async()=>{
 let n=0;const s=setup({leaseSteps:4,judge:async()=>{n++;return{answer:answer(n===1?'low':'medium')};}});
 await s.router.routeStart({threadId:'thread'});
 for(let i=0;i<3;i++){assert.equal((await s.router.hook({...s.p,tool_use_id:String(i)})).status,'lease_held');}
 assert.equal(n,1);s.router.turns.get('thread').lastAt=0;
 await s.router.hook({...s.p,tool_use_id:'fourth'});assert.equal(n,2);assert.equal(s.calls[0].params.effort,'medium');
});
test('failed tools, new input and elapsed lease trigger early reassessment',async()=>{
 for(const action of ['error','input','expiry']){
  let n=0;const s=setup({judge:async()=>{n++;return{answer:answer('low')};}});await s.router.routeStart({threadId:'thread'});
  const t=s.router.turns.get('thread');t.lastAt=0;
  if(action==='input')s.router.invalidate('thread',[{type:'text',text:'New requirement'}]);
  if(action==='expiry')t.leaseUntil=0;
  await s.router.hook({...s.p,tool_response:action==='error'?{exit_code:2}:'ok'});assert.equal(n,2);
 }
});
test('usage uses per-turn deltas, ignores duplicate snapshots and does not double-count reasoning',()=>{
 const s=setup();const counts=(i,o,r)=>({inputTokens:i,cachedInputTokens:0,outputTokens:o,reasoningOutputTokens:r,totalTokens:i+o});
 const send=(last,total)=>s.router.observe({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{last,total}}});
 send(counts(50,5,2),counts(1050,105,22));send(counts(50,5,2),counts(1050,105,22));
 send(counts(60,8,3),counts(1110,113,25));
 const complete={method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}};s.router.observe(complete);s.router.observe(complete);
 assert.equal(s.logs.length,1);assert.equal(s.logs[0].usage.inputTokens,110);assert.equal(s.logs[0].usage.outputTokens,13);assert.equal(s.logs[0].usage.reasoningOutputTokens,5);
});
test('absent usage is unknown; malformed counters and wrong turn are excluded',()=>{
 const s=setup();assert.equal(usageCounts({}),null);
 s.router.observe({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'old',tokenUsage:{}}});
 s.router.observe({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted'}}});
 assert.equal(s.logs[0].usage,null);assert.equal(s.logs[0].invalidUsageEvents,0);
});
test('native failure status rechecks even when the hook has empty stdout',async()=>{
 let n=0;const s=setup({judge:async()=>{n++;return{answer:answer('low')};}});await s.router.routeStart({threadId:'thread'});
 s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{id:'a',type:'commandExecution',status:'failed',exitCode:7}}});
 await s.router.hook({...s.p,tool_response:''});assert.equal(n,2);
 assert.equal(s.router.turns.get('thread').recent[0].failure.exitCode,7);
});
test('report separates missing usage and never invents saved quota',()=>{
 const common={kind:'turn_usage',threadId:'t',targetModel:'gpt-5.6-sol',status:'completed'};
 const measured={...common,turnId:'a',usage:{inputTokens:10,outputTokens:5,reasoningOutputTokens:3}};
 const report=summarize([measured,measured,{...common,turnId:'b',usage:null},{...common,turnId:'c',usage:{inputTokens:99},invalidUsageEvents:1}]);
 assert.equal(report.turns,3);assert.equal(report.models['gpt-5.6-sol'].usage.outputTokens,5);
 assert.equal(report.models['gpt-5.6-sol'].unknownUsageTurns,1);assert.equal(report.models['gpt-5.6-sol'].incompleteUsageTurns,1);
 assert.equal(report.savings.quota,null);
 const overhead=summarize([{kind:'effort_restore',status:'applied',elapsedMs:27},{kind:'decision',elapsedMs:81,inputTokens:10,outputTokens:2}]);
 assert.equal(overhead.routing.observedWaitMs,108);assert.equal(overhead.routing.decisions,1);assert.equal(overhead.routing.knownJevInputTokens,10);
});
test('routing diagnostics distinguish held changes, typed failures and metadata recovery',()=>{
 const report=summarize([
  {kind:'decision',status:'budget_held'},
  {kind:'fallback',code:'JEV_TIMEOUT'},
  {kind:'fallback',code:'JEV_TIMEOUT',measurementSource:'synthetic'},
  {kind:'metadata_unavailable',code:'METADATA_TIMEOUT'},
  {kind:'metadata_unavailable'},
  {kind:'metadata_loaded',attempt:1},
  {kind:'metadata_loaded',attempt:2},
 ]);
 assert.equal(report.routing.budgetHeld,1);assert.equal(report.routing.nativeUpdatesApplied,0);
 assert.deepEqual(report.routing.failureReasons,{JEV_TIMEOUT:1});
 assert.deepEqual(report.routing.metadataFailureReasons,{METADATA_TIMEOUT:1,UNKNOWN:1});
 assert.equal(report.routing.metadataRecoveries,1);assert.equal(report.excludedSyntheticEvents,1);
});
test('an interrupted turn still records final observed usage',()=>{
 const s=setup();s.router.stop('thread');
 const count={inputTokens:5,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:1,totalTokens:7};
 s.router.observe({method:'thread/tokenUsage/updated',params:{threadId:'thread',turnId:'turn',tokenUsage:{last:count,total:count}}});
 s.router.observe({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted'}}});
 assert.equal(s.logs[0].usage.totalTokens,7);assert.equal(s.logs[0].status,'interrupted');
});
const horizon = choice => ({type:'choice',choice:String(choice),confidence:1,probabilities:Object.fromEntries(Object.keys(horizonQuestion.criteria).map(k=>[k,k===String(choice)?1:0]))});
test('adaptive horizons reuse exactly N minus one completions then reassess',async()=>{
 for(const n of [1,2,5,10]){
  let count=0;const s=setup({judge:async()=>{count++;return{answer:answer('low'),horizon:horizon(n)};}});
  await s.router.routeStart({threadId:'thread'});
  for(let i=1;i<n;i++)assert.equal((await s.router.hook({...s.p,tool_use_id:String(i)})).status,'lease_held');
  assert.equal(count,1);await s.router.hook({...s.p,tool_use_id:'boundary'});assert.equal(count,2);
 }
 assert.equal(selectedHorizon({...horizon(10),choice:'99'}),1);
 assert.equal(selectedHorizon({...horizon(10),probabilities:{10:1}}),1);
});
test('published phase progress and steering override long lease without cooldown',async()=>{
 for(const phase of ['progress','steer']){
  let count=0;const s=setup({judge:async()=>{count++;return{answer:answer('low'),horizon:horizon(10)};}});
  await s.router.routeStart({threadId:'thread'});
  if(phase==='progress')s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',text:'The implementation failed; investigate the unexpected result.'}}});
  else s.router.invalidate('thread',[{type:'text',text:'Investigate the concurrency bug.'}]);
  await s.router.hook(s.p);assert.equal(count,2);
 }
});
test('parallel failure during a judgment gets one fresh judgment before releasing hooks',async()=>{
 let release,count=0;const s=setup({judge:async state=>{
  count++;if(count===1)return new Promise(r=>release=r);
  assert(state.recentTools.some(x=>x.output.includes('exit_code')));
  return{answer:answer('high'),horizon:horizon(1)};
 }});
 const a=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 const b=s.router.hook({...s.p,tool_use_id:'b',tool_response:{exit_code:2}});
 release({answer:answer('low'),horizon:horizon(10)});
 await Promise.all([a,b]);assert.equal(count,2);assert.equal(s.calls.length,0);
 assert.equal(s.router.turns.get('thread').current,'high');assert(s.logs.some(x=>x.status==='superseded'));
});
test('unapplied native recommendations never get a long reuse lease',async()=>{
 const s=setup({judge:async()=>({answer:answer('low'),horizon:horizon(10)}),request:async()=>({status:'targetUnavailable'})});
 await s.router.hook(s.p);assert.equal(s.router.turns.get('thread').lease,0);
});
test('continue receives bounded prior completed progress, never another thread state',()=>{
 const s=setup();s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',text:'Plan verified; copy the three literal values.'}}});
 s.router.observe({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});
 const t=s.router.start('thread',{model:'gpt-6-astra',effort:'high',input:[{type:'text',text:'Continue'}]});
 assert(s.router.state(t).previousTurn.progress[0].includes('Plan verified'));
 assert.equal(s.router.start('other',{}).previousTurn,undefined);
});
test('bounded evidence keeps both beginning and result tail and redacts secrets',()=>{
 const text=compact('BEGIN '+'.'.repeat(9000)+' END token=secretvalue',1000);
 assert.equal(text.length,1000);assert(text.startsWith('BEGIN'));assert(text.includes('END'));assert(!text.includes('secretvalue'));
});

test('manual turn settings fence an in-flight recommendation until native receipt',async()=>{
 let release,count=0;
 const s=setup({judge:async()=>{count++;return count===1?new Promise(r=>release=r):{answer:answer('keep')};}});
 const pending=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'medium'});
 release({answer:answer('low')});assert.equal((await pending).status,'stale');assert.equal(s.calls.length,0);
 assert.equal((await s.router.hook({...s.p,tool_use_id:'b'})).status,'external_settings_pending_or_unknown');
 s.router.finishSettingsUpdate(control,{status:'applied'});
 await s.router.hook({...s.p,tool_use_id:'c'});
 assert.equal(count,2);assert.equal(s.router.turns.get('thread').current,'medium');
});
test('rejected settings and settings for an old turn never pretend to apply',async()=>{
 const s=setup();assert.equal(s.router.beginSettingsUpdate({threadId:'thread',turnId:'old',effort:'low'}),null);
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'low'});
 s.router.finishSettingsUpdate(control,undefined,{code:-1});assert.equal(s.router.turns.get('thread').current,'high');
 assert.equal(s.router.turns.get('thread').settingsPending,0);
});
test('model changes preserve selected model and suspend routing for unknown native defaults',async()=>{
 for(const effort of ['medium',undefined]){
  const s=setup();s.router.supported.set('gpt-5.6-sol',['low','medium','high']);
  const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',model:'gpt-5.6-sol',effort});
  s.router.finishSettingsUpdate(control,{status:'applied'});
  const t=s.router.turns.get('thread');assert.equal(t.model,'gpt-5.6-sol');
  if(!effort){assert.equal(t.settingsUncertain,true);assert.equal((await s.router.hook({...s.p,model:'gpt-5.6-sol'})).status,'external_settings_pending_or_unknown');}
  else {await s.router.hook({...s.p,model:'gpt-5.6-sol'});assert.equal(s.calls[0].params.effort,'low');assert.equal(t.model,'gpt-5.6-sol');}
 }
});
test('future thread defaults update the next turn without changing the active turn',()=>{
 const s=setup();s.router.observe({method:'thread/settings/updated',params:{threadId:'thread',threadSettings:{model:'gpt-5.6-sol',effort:'medium',cwd:'/project'}}});
 assert.equal(s.router.turns.get('thread').current,'high');assert.equal(s.router.turns.get('thread').model,'gpt-6-astra');
 const next=s.router.start('thread',{});assert.equal(next.current,'medium');assert.equal(next.model,'gpt-5.6-sol');assert.equal(next.cwd,'/project');
});
test('late automatic receipt cannot overwrite an already confirmed manual change',async()=>{
 let release;const s=setup({request:async()=>new Promise(r=>release=r)});
 const pending=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'medium'});
 s.router.finishSettingsUpdate(control,{status:'applied'});release({status:'applied'});
 assert.equal((await pending).status,'stale');assert.equal(s.router.turns.get('thread').current,'medium');
 assert(s.logs.some(x=>x.status==='superseded'&&x.nativeStatus==='applied'));
 assert.equal(s.router.turns.get('thread').settingsUncertain,true);
});
test('overlapping or rejected controls during publication suspend further automatic changes',async()=>{
 let release;const s=setup({request:async()=>new Promise(r=>release=r)});
 const pending=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'medium'});
 s.router.finishSettingsUpdate(control,null,{code:-1});release({status:'applied'});await pending;
 assert.equal((await s.router.hook({...s.p,tool_use_id:'next'})).status,'external_settings_pending_or_unknown');
 assert.equal(s.router.turns.get('thread').lease,0);
});
test('public plan and summary invalidate the lease without sharing private reasoning',async()=>{
 let count=0;const s=setup({judge:async()=>{count++;return{answer:answer('low'),horizon:horizon(10)};}});
 await s.router.routeStart({threadId:'thread'});
 s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'reasoning',summary:['Inspect the conflicting test results'],content:['PRIVATE_REASONING_SENTINEL'],encrypted_content:'ENCRYPTED_SENTINEL'}}});
 s.router.observe({method:'turn/plan/updated',params:{threadId:'thread',turnId:'turn',plan:[{step:'Diagnose the conflict',status:'inProgress'}]}});
 await s.router.hook(s.p);assert.equal(count,2);
 const state=JSON.stringify(s.router.state(s.router.turns.get('thread')));
 assert(state.includes('Inspect the conflicting'));assert(state.includes('Diagnose'));assert(!state.includes('PRIVATE_REASONING'));assert(!state.includes('ENCRYPTED'));
});
test('a public update during judgment causes a bounded refresh with the latest state',async()=>{
 let release,count=0;const s=setup({judge:async state=>{
  count++;if(count===1)return new Promise(r=>release=r);
  assert(state.progress.some(x=>x.includes('New conflict')));return{answer:answer('high')};
 }});
 const pending=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',text:'New conflict changes the investigation'}}});
 release({answer:answer('low')});await pending;assert.equal(count,2);assert.equal(s.calls.length,0);
});
test('routine reasoning summaries enrich context without spending the long reuse lease on new calls',async()=>{
 let count=0;const s=setup({judge:async()=>{count++;return{answer:answer('low'),horizon:horizon(10)};}});
 await s.router.routeStart({threadId:'thread'});
 for(let i=0;i<3;i++){
  s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'reasoning',summary:['Routine verification '+i]}}});
  assert.equal((await s.router.hook({...s.p,tool_use_id:'summary-'+i})).status,'lease_held');
 }
 assert.equal(count,1);assert.equal(s.router.state(s.router.turns.get('thread')).publicNotes.length,3);
});
test('a late successful tool result also supersedes the earlier snapshot',async()=>{
 let release,count=0;const states=[];const s=setup({judge:async state=>{
  states.push(state);return ++count===1?new Promise(r=>release=r):{answer:answer('high')};
 }});
 const a=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 const b=s.router.hook({...s.p,tool_use_id:'b',tool_response:'A contradiction was found, exit code 0'});
 release({answer:answer('low')});await Promise.all([a,b]);
 assert.equal(states[0].recentTools.length,1);assert.equal(states[1].recentTools.length,2);assert.equal(s.calls.length,0);
});
test('continuously changing evidence preserves effort after one refresh',async()=>{
 let s,count=0;s=setup({judge:async()=>{
  count++;s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',text:'progress '+count}}});
  return{answer:answer('low'),horizon:horizon(10)};
 }});
 assert.equal((await s.router.hook(s.p)).status,'stale_evidence');assert.equal(count,2);assert.equal(s.calls.length,0);
 assert.equal(s.router.turns.get('thread').lease,0);
});
test('progress arriving during native publication prevents reuse of that decision',async()=>{
 let release;const s=setup({judge:async()=>({answer:answer('low'),horizon:horizon(10)}),request:async()=>new Promise(r=>release=r)});
 const pending=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 s.router.observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'plan',text:'Investigate unresolved failure'}}});
 release({status:'applied'});await pending;assert.equal(s.router.turns.get('thread').lease,0);assert.equal(s.router.turns.get('thread').forceRecheck,true);
 assert.equal(s.logs.at(-1).confirmation,'native_settings_published');assert.equal(s.logs.at(-1).leaseUnit,'observed_tool_batch_or_boundary');
});
test('runtime identity is deterministic, detects changed sources and never invents old identities',()=>{
 assert.equal(runtimeFingerprint({a:'one',b:'two'}),runtimeFingerprint({b:'two',a:'one'}));
 assert.notEqual(runtimeFingerprint({a:'one'}),runtimeFingerprint({a:'two'}));assert.equal(runtimeFingerprint(undefined),null);assert.equal(runtimeFingerprint({}),null);
});

test('delayed parallel completions settle before one fresh judgment',async()=>{
 let judgments=0;const s=setup({coalesceMs:50,judge:async state=>{
  judgments++;assert.equal(state.recentTools.length,2);return{answer:answer('low')};
 }});
 const a=s.router.hook(s.p);await new Promise(r=>setImmediate(r));
 assert.equal(judgments,0);
 const b=s.router.hook({...s.p,tool_use_id:'b',tool_response:'second result'});
 await Promise.all([a,b]);assert.equal(judgments,1);assert.equal(s.calls.length,1);
 assert(s.logs.find(x=>x.kind==='decision').elapsedMs>=40);
 assert.equal(s.router.turns.get('thread').coalescedBoundaries,1);
});
test('interruption during the bounded settling window spends no evaluator request',async()=>{
 let judgments=0;const s=setup({coalesceMs:20,judge:async()=>{judgments++;return{answer:answer('low')};}});
 const p=s.router.hook(s.p);await new Promise(r=>setImmediate(r));s.router.stop('thread');
 assert.equal((await p).status,'stale');assert.equal(judgments,0);assert.equal(s.calls.length,0);
});
test('routine calls reserve two judgments for late failures and then restore baseline',async()=>{
 let judgments=0;const s=setup({judge:async()=>{judgments++;return{answer:answer('low')};}});
 await s.router.routeStart({threadId:'thread'});
 for(let i=0;i<3;i++)await s.router.hook({...s.p,tool_use_id:'routine'+i});
 assert.equal(judgments,4);
 await s.router.hook({...s.p,tool_use_id:'no-reserve'});
 assert.equal(judgments,4);assert.equal(s.router.turns.get('thread').current,'high');
 for(let i=0;i<2;i++)await s.router.hook({...s.p,tool_use_id:'failure'+i,tool_response:{exit_code:1}});
 assert.equal(judgments,6);assert.equal(s.router.turns.get('thread').current,'high');
 await s.router.hook({...s.p,tool_use_id:'last-failure',tool_response:{exit_code:2}});
 assert.equal(judgments,6);assert.equal(s.router.turns.get('thread').current,'high');
 assert.equal(s.logs.filter(x=>x.kind==='effort_restore'&&x.status==='applied').length,1);
 const report=summarize(s.logs);assert.equal(report.routing.baselineRestoresApplied,1);assert.equal(report.routing.budgetHeld,2);
 assert.equal(report.routing.knownJevInputTokens,0);assert.equal(report.routing.decisions,5);
});
test('new input and public plan can use reserved judgments after routine exhaustion',async()=>{
 for(const reason of ['input','plan']){
  let judgments=0;const s=setup({judge:async()=>{judgments++;return{answer:answer('high')};}});
  for(let i=0;i<4;i++)await s.router.hook({...s.p,tool_use_id:'routine'+i});
  await s.router.hook({...s.p,tool_use_id:'skip'});assert.equal(judgments,4);
  if(reason==='input')s.router.invalidate('thread',[{type:'text',text:'Investigate a new failure'}]);
  else s.router.observe({method:'turn/plan/updated',params:{threadId:'thread',turnId:'turn',plan:[{step:'Diagnose failure',status:'inProgress'}]}});
  await s.router.hook({...s.p,tool_use_id:'urgent'});assert.equal(judgments,5);
 }
});
test('routine stale results cannot consume the reserved capacity',async()=>{
 let release,count=0;const s=setup({judge:async()=>{
  count++;return count===4?new Promise(r=>release=r):{answer:answer('low')};
 }});
 for(let i=0;i<3;i++)await s.router.hook({...s.p,tool_use_id:'early'+i});
 const a=s.router.hook({...s.p,tool_use_id:'four'});await new Promise(r=>setImmediate(r));
 const b=s.router.hook({...s.p,tool_use_id:'late'});release({answer:answer('low')});await Promise.all([a,b]);
 assert.equal(count,4);assert.equal(s.router.turns.get('thread').current,'high');
 assert(s.logs.some(x=>x.kind==='effort_restore'&&x.reason==='stale_evidence'));
});
test('budget restores respect manual baseline and never lower a stronger current effort',async()=>{
 const s=setup({maxCalls:1});await s.router.routeStart({threadId:'thread'});
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'medium'});
 s.router.finishSettingsUpdate(control,{status:'applied'});
 const t=s.router.turns.get('thread');t.current='low';
 await s.router.hook({...s.p,tool_use_id:'restore'});assert.equal(t.current,'medium');
 const count=s.calls.length;t.current='xhigh';
 await s.router.hook({...s.p,tool_use_id:'stronger'});assert.equal(t.current,'xhigh');assert.equal(s.calls.length,count);
});
test('manual publication fences an in-flight budget restoration',async()=>{
 let release;const s=setup({maxCalls:1});await s.router.routeStart({threadId:'thread'});
 s.router.request=async()=>new Promise(r=>release=r);
 const p=s.router.hook({...s.p,tool_use_id:'restore'});await new Promise(r=>setImmediate(r));
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'medium'});
 s.router.finishSettingsUpdate(control,{status:'applied'});release({status:'applied'});
 assert.equal((await p).status,'stale');assert.equal(s.router.turns.get('thread').current,'medium');
 assert(s.logs.some(x=>x.kind==='effort_restore'&&x.status==='superseded'&&x.confirmation===null));
});
test('unconfirmed or rejected restoration never fabricates applied or retries indefinitely',async()=>{
 for(const outcome of ['timeout','targetUnavailable']){
  const s=setup({maxCalls:1});await s.router.routeStart({threadId:'thread'});let attempts=0;
  s.router.request=async()=>{attempts++;if(outcome==='timeout')throw new Error('TIMEOUT');return{status:outcome};};
  await s.router.hook({...s.p,tool_use_id:'restore'});await s.router.hook({...s.p,tool_use_id:'again'});
  assert.equal(attempts,1);assert.equal(s.router.turns.get('thread').current,'low');
  assert.equal(s.logs.at(-1).confirmation,null);assert.notEqual(s.logs.at(-1).status,'applied');
 }
});
test('shared evaluator budget failure after downgrade restores baseline without another judgment',async()=>{
 let judgments=0;const s=setup({judge:async()=>{if(++judgments>1)throw new Error('TASK_CALL_BUDGET');return{answer:answer('low')};}});
 await s.router.hook(s.p);await s.router.hook({...s.p,tool_use_id:'unavailable'});
 await s.router.hook({...s.p,tool_use_id:'later'});
 assert.equal(judgments,2);assert.equal(s.router.turns.get('thread').current,'high');
 assert(s.logs.some(x=>x.kind==='effort_restore'&&x.reason==='evaluator_unavailable'&&x.status==='applied'));
});
test('timed-out native routing publication never sends a competing baseline restore',async()=>{
 let judgments=0;const s=setup({judge:async()=>({answer:answer(++judgments===1?'low':'medium')})});
 await s.router.hook(s.p);let publications=0;
 s.router.request=async()=>{publications++;throw new Error('TIMEOUT');};
 await s.router.hook({...s.p,tool_use_id:'timeout'});await s.router.hook({...s.p,tool_use_id:'later'});
 assert.equal(publications,1);assert.equal(judgments,2);assert.equal(s.router.turns.get('thread').settingsUncertain,true);
 assert(!s.logs.some(x=>x.kind==='effort_restore'));
});
test('the final routine judgment cannot introduce a downgrade with no routine capacity left',async()=>{
 let n=0;const s=setup({judge:async()=>({answer:answer(++n<4?'high':'medium')})});
 for(let i=0;i<4;i++)await s.router.hook({...s.p,tool_use_id:String(i)});
 assert.equal(n,4);assert.equal(s.calls.length,0);assert.equal(s.logs.at(-1).status,'budget_held');
 await s.router.hook({...s.p,tool_use_id:'next'});assert.equal(s.calls.length,0);
});
test('reserved judgments respect the user ceiling after baseline restoration',async()=>{
 let n=0;const s=setup({judge:async()=>({answer:answer(++n<5?'low':'xhigh')})});
 await s.router.routeStart({threadId:'thread'});
 for(let i=0;i<4;i++)await s.router.hook({...s.p,tool_use_id:String(i)});
 assert.equal(s.router.turns.get('thread').current,'high');
 await s.router.hook({...s.p,tool_use_id:'failure',tool_response:{exit_code:1}});
 assert.equal(s.router.turns.get('thread').current,'high');assert.equal(n,5);
});
test('baseline keep honors a valid stability recommendation with a two-boundary cap',async()=>{
 let n=0;const s=setup({judge:async()=>{n++;return{answer:answer('keep'),horizon:horizon(5)};}});
 await s.router.routeStart({threadId:'thread'});const t=s.router.turns.get('thread');
 assert.equal(t.horizon,2);assert.equal(t.horizonReason,'keep_at_baseline');
 assert.equal((await s.router.hook(s.p)).status,'lease_held');assert.equal(n,1);
 await s.router.hook({...s.p,tool_use_id:'b',tool_response:{exit_code:1}});assert.equal(n,2);
 assert.equal(s.logs.at(-1).recommendedHorizon,5);assert.equal(s.logs.at(-1).horizon,2);
});
test('keep never extends an uncertain automatic downgrade or malformed horizon',async()=>{
 const s=setup(),t=s.router.turns.get('thread');t.current='low';
 s.router.renew(t,{answer:answer('keep'),horizon:horizon(10)});assert.equal(t.lease,0);assert.equal(t.horizonReason,'uncertain_effort');
 t.current='high';s.router.renew(t,{answer:answer('keep'),horizon:{...horizon(5),confidence:NaN}});assert.equal(t.lease,0);assert.equal(t.horizonReason,'invalid_horizon');
});
test('routine shared-budget exhaustion leaves reserved failure reassessment available',async()=>{
 const priorities=[];const s=setup({judge:async(state,ctx)=>{priorities.push(ctx.priority);if(ctx.priority!=='urgent')throw Error('TASK_URGENT_RESERVE');return{answer:answer('xhigh'),horizon:horizon(2)};}});
 await s.router.routeStart({threadId:'thread'});
 assert.equal((await s.router.hook(s.p)).status,'urgent_reserve_held');
 await s.router.hook({...s.p,tool_use_id:'failed',tool_response:{exit_code:2}});
 assert.deepEqual(priorities,['routine','urgent']);assert.equal(s.router.turns.get('thread').current,'high');
});
test('new published progress can use the reserve after an early shared-budget block',async()=>{
 const priorities=[];const s=setup({judge:async(state,ctx)=>{priorities.push(ctx.priority);if(ctx.priority!=='urgent')throw Error('TASK_URGENT_RESERVE');return{answer:answer('high'),horizon:horizon(2)};}});
 await s.router.routeStart({threadId:'thread'});
 s.router.note(s.router.turns.get('thread'),'public_progress','A new unresolved dependency needs inspection');
 await s.router.hook({...s.p,tool_use_id:'progress'});assert.deepEqual(priorities,['routine','urgent']);
});

test('medium user ceiling prevents first-step and later automatic upgrades, with honest receipts',async()=>{
 const s=setup({judge:async()=>({answer:answer('high'),horizon:horizon(1)})});
 const params={threadId:'thread',model:'gpt-6-astra',effort:'medium',input:[{type:'text',text:'Investigate concurrency'}]};
 const t=s.router.start('thread',params);assert.equal((await s.router.routeStart(params)).effort,'medium');
 s.router.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
 await s.router.hook(s.p);assert.equal(t.current,'medium');assert.equal(s.calls.length,0);
 assert(s.logs.some(e=>e.kind==='decision'&&e.recommended==='high'&&e.published==='medium'&&e.ceilingApplied));
 const control=s.router.beginSettingsUpdate({threadId:'thread',turnId:'turn',effort:'high'});
 s.router.finishSettingsUpdate(control,{status:'applied'});assert.equal(t.baseline,'high');
});
test('late budget can return an older automatic upgrade to baseline',async()=>{
 const s=setup({judge:async()=>({answer:answer('medium')})});const t=s.router.turns.get('thread');
 t.baseline='medium';t.current='high';t.calls=s.router.routineLimit-1;
 await s.router.hook(s.p);assert.equal(t.current,'medium');assert.equal(s.calls.at(-1).params.effort,'medium');
});
test('two denied upgrades do not suppress a subsequent valid downgrade',async()=>{
 let n=0;const s=setup({judge:async()=>({answer:answer(++n<=2?'xhigh':'medium'),horizon:horizon(1)})});
 await s.router.routeStart({threadId:'thread'});await s.router.hook(s.p);
 assert.equal(n,2);assert.equal(s.router.turns.get('thread').current,'high');
 s.router.note(s.router.turns.get('thread'),'public_progress','Diagnosis complete; implement the small verified repair');
 await s.router.hook({...s.p,tool_use_id:'new-phase'});
 assert.equal(n,3);assert.equal(s.router.turns.get('thread').current,'medium');
 assert.equal(s.calls.at(-1).params.effort,'medium');
});
