import test from 'node:test';
import assert from 'node:assert/strict';
import {Router,select,redact,effortQuestion,horizonQuestion,selectedHorizon,compact,SUPPORTED_MODELS,usageCounts} from '../runtime/desktop/router.mjs';
import {proxyEnvironment} from '../runtime/desktop/bootstrap.mjs';
import {summarize} from '../runtime/desktop/report.mjs';
const answer=(choice,confidence=1)=>({type:'choice',choice,confidence,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k===choice?1:0]))});
function setup(options={}){
 const calls=[],logs=[];const router=new Router({judge:async()=>({answer:answer('low'),model:'fixture',inputTokens:10}),request:async(method,params)=>{calls.push({method,params});return{status:'applied'};},log:x=>logs.push(x),...options});
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
 const s=setup({maxCalls:1});await s.router.hook(s.p);await s.router.hook(s.p);s.router.turns.get('thread').lastAt=0;await s.router.hook({...s.p,tool_use_id:'b'});assert.equal(s.calls.length,1);
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
