import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Router,effortQuestion,horizonQuestion,routineProgress} from '../runtime/desktop/router.mjs';
import {Store,hash} from '../src/core.mjs';
import {checkpointObserver,checkpointForTurn,resumeContext} from '../src/checkpoints.mjs';
import {createAutomation} from '../src/automation.mjs';
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
async function routerFixture(){
 let calls=0;const router=new Router({groupToolBatches:true,coalesceMs:0,judge:async()=>{calls++;return{answer:choice(effortQuestion,'low'),horizon:choice(horizonQuestion,'5')};},request:async()=>({status:'applied'})});
 router.supported.set('gpt-6-astra',['low','medium','high']);const t=router.start('thread',{model:'gpt-6-astra',effort:'high',input:[{type:'text',text:'Apply the verified formatting plan'}]});
 await router.routeStart({threadId:'thread'},t);router.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
 const start=id=>router.observe({method:'item/started',params:{threadId:'thread',turnId:'turn',item:{id,type:'commandExecution'}}});
 const hook=(id,extra={})=>router.hook({session_id:'thread',turn_id:'turn',hook_event_name:'PostToolUse',tool_use_id:id,tool_name:'Bash',tool_response:'ok',...extra});
 return{router,t,start,hook,calls:()=>calls};
}
test('five staggered results in one observed batch consume only one reuse boundary',async()=>{
 const s=await routerFixture();for(let i=0;i<5;i++)s.start('tool'+i);
 for(let i=0;i<5;i++)await s.hook('tool'+i);
 assert.equal(s.calls(),1);assert.equal(s.t.leaseSkips,1);assert.equal(s.t.batchLeaseSkips,4);assert.equal(s.t.lease,3);
 // The pinned runtime may start the next tool after the preceding hook ended.
 s.start('later');await s.hook('later');assert.equal(s.t.lease,3);assert.equal(s.t.batchLeaseSkips,5);
 // Missing usage notifications cannot merge arbitrarily many tools.
 for(let i=6;i<17;i++){s.start('later'+i);await s.hook('later'+i);}
 assert.equal(s.t.lease,2);assert.equal(s.t.leaseSkips,2);
});
test('native usage boundaries separate overlapping cohorts and invalid usage disables grouping',async()=>{
 const s=await routerFixture();s.start('a');s.start('b');await s.hook('a');
 const counts={inputTokens:10,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0,totalTokens:11};
 s.router.observe({method:'thread/tokenUsage/updated',params:{threadId:'thread',tokenUsage:{total:counts,last:counts}}});
 s.start('c');await s.hook('c');assert.equal(s.t.leaseSkips,2);
 s.router.observe({method:'thread/tokenUsage/updated',params:{threadId:'thread',tokenUsage:{}}});
 await s.hook('b');assert.equal(s.t.batchLeaseSkips,0);assert.equal(s.t.leaseSkips,3);
});
test('failure, new input and expired TTL override same-batch reuse',async()=>{
 for(const trigger of ['failure','input','expiry']){
  const s=await routerFixture();s.start('a');s.start('b');await s.hook('a');
  if(trigger==='input')s.router.invalidate('thread',[{type:'text',text:'Investigate a new conflict'}]);
  if(trigger==='expiry')s.t.leaseUntil=0;
  await s.hook('b',trigger==='failure'?{tool_response:{exit_code:1}}:{});assert.equal(s.calls(),2,trigger);
 }
});
test('missing tool starts retain ordinary boundary accounting',async()=>{
 const s=await routerFixture();for(let i=0;i<5;i++)await s.hook('unobserved'+i);assert.equal(s.calls(),2);assert.equal(s.t.batchLeaseSkips,0);
});
test('only narrow routine progress preserves reuse; a changed plan triggers judgment',async()=>{
 const s=await routerFixture();
 for(const text of ['检查通过，继续原计划。','The first check passed; continuing the same plan.']){
  assert(routineProgress(text));s.router.observe({method:'item/completed',params:{threadId:'thread',item:{type:'agentMessage',text}}});await s.hook(text);
 }
 assert.equal(s.calls(),1);assert.equal(s.t.routineProgressNotes,2);
 for(const text of ['检查通过，但发现另一处失败','继续原计划，忽略冲突','The first check passed; changing the plan.'])assert.equal(routineProgress(text),false);
 s.router.observe({method:'item/completed',params:{threadId:'thread',item:{type:'agentMessage',text:'Found conflicting evidence; investigate the race.'}}});await s.hook('conflict');assert.equal(s.calls(),2);
});
function fixture(t){const root=mkdtempSync(join(tmpdir(),'jev-context-')),store=new Store({home:join(root,'private')}),project=store.project(root);t.after(()=>store.close());return{root,store,project,turn:{threadId:'thread',turnId:'turn-a',cwd:root,task:'Fix parsing'},id:'auto-'+hash('thread')};}
test('ten thousand irrelevant deltas never touch checkpoint storage',()=>{
 let reads=0;const observe=checkpointObserver({project(){reads++;throw new Error('unexpected');},get(){reads++;}});
 for(let i=0;i<10000;i++)observe({method:'item/agentMessage/delta',params:{threadId:'thread',delta:'x'}},{cwd:'/fixture',threadId:'thread',turnId:'turn'});
 assert.equal(reads,0);
});
test('new-turn checkpoint separates inherited pending work and current receipts',t=>{
 const f=fixture(t),observe=checkpointObserver(f.store);
 observe({method:'turn/plan/updated',params:{plan:[{step:'old verification',status:'pending'}]}},f.turn);
 const next={...f.turn,turnId:'turn-b',task:'Different task'};
 observe({method:'item/completed',params:{item:{type:'commandExecution',id:'new-tool',status:'completed',exitCode:0}}},next);
 const saved=f.store.get(f.project,'checkpoint',f.id);assert.deepEqual(saved.pending,[]);assert.equal(saved.plan,undefined);assert.deepEqual(saved.inherited.pending,['old verification']);assert.equal(saved.inherited.sourceTurnId,'turn-a');assert.equal(saved.toolReceipts[0].turnId,'turn-b');
 const third=checkpointForTurn(saved,{...next,turnId:'turn-c'});assert.equal(third.inherited.inherited,undefined);
});
test('slow snapshots do not block notifications and cannot overwrite a newer turn',async t=>{
 const f=fixture(t);let release;const observe=checkpointObserver(f.store,{snapshot:()=>new Promise(r=>release=r)});
 const pending=observe({method:'turn/completed',params:{turn:{id:'turn-a',status:'completed'}}},f.turn);
 assert.equal(f.store.get(f.project,'checkpoint',f.id).snapshotStatus,'pending');await new Promise(r=>setImmediate(r));
 observe({method:'item/completed',params:{item:{type:'agentMessage',text:'new progress'}}},{...f.turn,turnId:'turn-b'});
 release({sourceHashes:{old:'hash'},coverage:'worktree_changes'});await pending;await observe.flush();
 const saved=f.store.get(f.project,'checkpoint',f.id);assert.equal(saved.turnId,'turn-b');assert.deepEqual(saved.sourceHashes,{});assert.equal(saved.lastPublishedProgress,'new progress');assert.equal(saved.progressSource.turnId,'turn-b');
});
test('snapshot failures remain explicit and flush completes outstanding writes',async t=>{
 const f=fixture(t),observe=checkpointObserver(f.store,{snapshot:async()=>{throw new Error('unavailable');}});
 observe({method:'turn/completed',params:{turn:{id:'turn-a',status:'completed'}}},f.turn);await observe.flush();assert.equal(f.store.get(f.project,'checkpoint',f.id).snapshotStatus,'unavailable');
});
test('resume is scoped, fresh, bounded and drops stale progress on file change',async t=>{
 const f=fixture(t);writeFileSync(join(f.root,'a.txt'),'before');const saved={...checkpointForTurn(undefined,f.turn),updatedAt:new Date().toISOString(),sourceHashes:{'a.txt':hash('before')},coverage:'partial',snapshotStatus:'ready',pending:['verify'],lastPublishedProgress:'Patch prepared'};
 f.store.put(f.project,'checkpoint',saved,f.id);
 const r=await resumeContext(f.store,f.root,'thread','重启好了');assert.equal(r.sourceTurnId,'turn-a');assert.equal(r.requiresReview,true);assert.equal(r.validation.coverage,'partial');assert.deepEqual(r.pending,['verify']);
 assert.equal(await resumeContext(f.store,f.root,'other','continue'),undefined);assert.equal(await resumeContext(f.store,f.root,'thread','Write an unrelated app'),undefined);
 assert.equal(await resumeContext(f.store,f.root,'thread','continue',{clock:()=>Date.now()+86400001}),undefined);
 const other=mkdtempSync(join(tmpdir(),'jev-other-'));assert.equal(await resumeContext(f.store,other,'thread','continue'),undefined);
 writeFileSync(join(f.root,'a.txt'),'after');const changed=await resumeContext(f.store,f.root,'thread','continue');assert.deepEqual(changed.pending,[]);assert.deepEqual(changed.progress,[]);assert.equal(changed.validation.changedFilesCount,1);
});
test('automatic tool checkpoint cannot relabel prior-turn pending work',async t=>{
 const f=fixture(t);f.store.put(f.project,'checkpoint',{...checkpointForTurn(undefined,f.turn),pending:['old work']},f.id);const auto=createAutomation({store:f.store,key:'fixture'});
 await auto.hook({cwd:f.root,session_id:'thread',turn_id:'turn-b',hook_event_name:'UserPromptSubmit',prompt:'New task'});
 await auto.hook({cwd:f.root,session_id:'thread',turn_id:'turn-b',hook_event_name:'PostToolUse',tool_use_id:'tool',tool_name:'Bash',tool_response:'ok'});
 const saved=f.store.get(f.project,'checkpoint',f.id);assert.equal(saved.turnId,'turn-b');assert.deepEqual(saved.pending,[]);assert.deepEqual(saved.inherited.pending,['old work']);await auto.flush();
});
test('repeated continuation checkpoints preserve the original task with provenance',async t=>{
 const f=fixture(t);let saved=checkpointForTurn(undefined,f.turn);
 saved=checkpointForTurn(saved,{...f.turn,turnId:'turn-b',task:'继续'});
 saved=checkpointForTurn(saved,{...f.turn,turnId:'turn-c',task:'重启好了'});
 f.store.put(f.project,'checkpoint',saved,f.id);
 const r=await resumeContext(f.store,f.root,'thread','开始吧');assert.equal(r.task,'Fix parsing');assert.equal(r.taskSourceTurnId,'turn-a');assert.equal(r.sourceTurnId,'turn-c');
 const fresh=checkpointForTurn(saved,{...f.turn,turnId:'turn-d',task:'New unrelated task'});assert.equal(fresh.historicalTask,undefined);
});
