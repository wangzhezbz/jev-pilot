// Offline mechanism comparison; no paid API and no fabricated savings estimate.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const baseline=process.argv.find(x=>x.startsWith('--baseline='))?.slice(11);
if(!baseline)throw Error('A frozen baseline checkout is required');
const current=resolve(import.meta.dirname,'../..');
const output=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||join(current,'docs/reports/overall-audit-20260925'));
const results=[];
for(const [arm,root] of [['baseline',resolve(baseline)],['candidate',current]]){
 const {Router,effortQuestion,horizonQuestion}=await import(pathToFileURL(join(root,'runtime/desktop/router.mjs')));
 const {Store,Judge,loadConfig}=await import(pathToFileURL(join(root,'src/core.mjs')));
 const {prepareOutput}=await import(pathToFileURL(join(root,'src/prepare-output.mjs')));
 const answer=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
 for(const scenario of ['stable-six-boundaries','later-simple-step']){
  let calls=0,boundary=-1;const updates=[];
  const router=new Router({coalesceMs:0,judge:async()=>{calls++;return{answer:answer(effortQuestion,scenario==='later-simple-step'&&boundary>=7?'low':'high'),horizon:answer(horizonQuestion,'1')};},request:async(method,p)=>{updates.push(p.effort);return{status:'applied'};}});
  router.supported.set('gpt-6-astra',['low','medium','high']);
  const params={threadId:'offline',model:'gpt-6-astra',effort:'high',input:[{type:'text',text:'Inspect the agreed verification steps'}]};
  const turn=router.start('offline',params);turn.turnId='fixture';await router.routeStart(params,turn);
  for(boundary=0;boundary<(scenario==='stable-six-boundaries'?6:8);boundary++)await router.hook({session_id:'offline',turn_id:'fixture',hook_event_name:'PostToolUse',tool_use_id:'read'+boundary,tool_name:'read',tool_response:'Successful bounded observation'});
  results.push({arm,scenario,evaluatorCalls:calls,finalEffort:turn.current,mockAppliedUpdates:updates});
 }
 for(const [scenario,config] of [['insufficient-shared-calls',{taskMaxCalls:1}],['insufficient-shared-bytes',{taskMaxBytes:17000,taskReservedBytes:0}]]){
  const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-audit-offline-'))});
  try{
   let calls=0;const ctx={store,project:'synthetic',config:{...loadConfig(store,'synthetic'),cacheMs:0,...config}};
   ctx.judge=new Judge({...ctx,key:'synthetic-not-a-key',taskId:'offline-fixture',send:async p=>{calls++;return{model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>[id,answer({criteria:{keep:1,review:1,exclude:1}},'exclude')]))};}});
   const value=Array.from({length:49},(_,i)=>`## Record ${i}\nUnrelated resolved record ${i} ${'detail '.repeat(35)}\n`).join('\n');
   const result=await prepareOutput(ctx,{goal:'Find target facts',value});
   results.push({arm,scenario,evaluatorCalls:calls,exactOriginalPreserved:result.value===value,status:result.selection.status,reason:result.selection.reason});
  }finally{store.close();}
 }
}
mkdirSync(output,{recursive:true});
const report={measurement:'offline_deterministic_mechanism_comparison',paidJevRequests:0,paidGptTasks:0,developmentConversationExcluded:true,wallTimeSavings:null,tokenSavings:null,results};
writeFileSync(join(output,'mechanism-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
