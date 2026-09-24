// Default is offline. --live spends at most one real Jev request using the
// current task's unmodified shared guard. --live-suite spends at most 15 requests.
// Neither mode resets task budgets.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store,Judge,loadConfig,transport,hash} from '../../src/core.mjs';
import * as currentWorkflows from '../../src/workflows.mjs';
import * as currentEvidence from '../../src/evidence.mjs';
const baseline='b8189c063aab5b152127711103a30b071e2adcba';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'docs/reports/workflow-efficiency-20260925');
mkdirSync(out,{recursive:true});
async function oldModule(file){
 const source=execFileSync('git',['show',`${baseline}:src/${file}`],{cwd:root,encoding:'utf8'});
 const linked=source.replace(/from (['"])(\.[^'"]+)\1/g,(_,quote,path)=>`from ${quote}${pathToFileURL(resolve(root,'src',path)).href}${quote}`);
 return import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
}
const oldWorkflows=await oldModule('workflows.mjs'),oldEvidence=await oldModule('evidence.mjs');
const tools=Array.from({length:12},(_,i)=>({id:`t${i}`,text:`Required verification capability ${i}`}));
const cases=[
 {id:'required-tools',operation:'selectTools',input:{goal:'Keep every explicitly required verification tool',tools,required:tools.map(x=>x.id)},accept:r=>r.selected.length===12},
 {id:'review',operation:'reviewChanges',input:{goal:'Review a parser change',changes:[{id:'parser',text:'Reject an invalid integer instead of silently using zero'}],tests:Array.from({length:12},(_,i)=>({id:`t${i}`,text:`Test suite ${i}`,...(i<9?{required:true}:{})}))},accept:r=>r.run.length===9&&r.risks.length===1},
 {id:'quality',operation:'quality',input:{content:'The total is unknown',rules:[{id:'r',text:'Preserve uncertainty'}],translations:[{id:'zh',text:'总数未知'}]},accept:r=>r.verdict==='passed'},
 {id:'shifted-context',operation:'compactContext',input:{goal:'Current billing task',session:'fixture',preserveRecent:1,blocks:[{id:'a',role:'tool_call',callId:'exchange',content:'Read old catalog',readOnly:true,verified:true},{id:'b',role:'tool_result',callId:'exchange',content:'Completed unrelated catalog'},{id:'u',role:'user',content:'Current billing task'}]},accept:r=>r.omittedCallIds.length===1}
];
const suite=process.argv.includes('--live-suite'),live=process.argv.includes('--live')||suite,rows=[];
if(suite){
 const review=cases.find(c=>c.id==='review');
 review.input.tests=review.input.tests.map((t,i)=>({...t,text:i<9?`Required parser regression ${i}: reject malformed integers`:`Marketing color screenshot ${i}: isolated landing-page styles, no parser or integer dependency`}));
}
const prefix=suite?'live-suite':live?'live':'offline';
const plan={at:new Date().toISOString(),baseline,kind:suite?'real_component_suite':live?'one_request_required_tool_probe':'offline_component_AB',live,maxPaidCalls:suite?15:live?1:0,gptCalls:0,delayMs:live?null:40,repetitions:live?1:3,cases:live&&!suite?['required-tools']:cases.map(x=>x.id),boundary:'Function execution only; excludes Codex planning, tool dispatch and final answer. Offline times are synthetic, not provider speed. Required-tools is a known-decision case, not general task savings. No quota overrides.'};
writeFileSync(join(out,prefix+'-plan.json'),JSON.stringify(plan,null,2)+'\n');
for(let repetition=0;repetition<plan.repetitions;repetition++)for(const spec of live&&!suite?cases.slice(0,1):cases){
 for(const variant of repetition%2?['optimized','baseline']:['baseline','optimized']){
  const store=live?new Store():new Store({home:mkdtempSync(join(tmpdir(),'jev-efficiency-bench-'))});
  const project=store.project(root),config={...loadConfig(store,project),cacheMs:spec.id==='shifted-context'?600000:0};
  const taskId=process.env.CODEX_THREAD_ID;
  if(live&&!taskId)throw Error('REAL_TASK_ID_REQUIRED');
  let active=0,peak=0;const requests=[];
  const send=async(...args)=>{
   const p=args[0],entry={requestHash:hash(p),requestBytes:Buffer.byteLength(JSON.stringify(p)),questions:Object.keys(p.questions).length};requests.push(entry);active++;peak=Math.max(peak,active);const start=performance.now();
   try{
    let result;
    if(live)result=await transport(...args);
    else{await new Promise(r=>setTimeout(r,40));result={model:'offline-fixture',answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>{const choice=['exclude','defer','skip','routine','pass'].find(c=>Object.hasOwn(q.criteria,c));return[id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))};}
    Object.assign(entry,{status:'success',model:result.model,usage:result.usage??null});return result;
   }catch(e){entry.status='failed';entry.code=e.code??'UNAVAILABLE';throw e;}
   finally{active--;entry.elapsedMs=performance.now()-start;}
  };
  const module=spec.operation==='compactContext'?(variant==='baseline'?oldEvidence:currentEvidence):(variant==='baseline'?oldWorkflows:currentWorkflows);
  const capacityBefore=new Judge({store,project,config,taskId}).guard.capacity({model:config.model});
  const results=[],start=performance.now();
  try{
   for(let shift=0;shift<(spec.id==='shifted-context'?5:1);shift++){
    const judge=new Judge({store,project,config,send,taskId,...(live?{}:{key:'offline-fixture'})});
    const input=spec.id==='shifted-context'?{...spec.input,blocks:[...Array.from({length:shift},(_,i)=>({id:`prefix${i}`,role:'system',content:'Unchanged constraint'})),...spec.input.blocks]}:spec.input;
    results.push(await module[spec.operation]({store,project,root,config,judge,taskId},input));
   }
   const row={case:spec.id,repetition,variant,elapsedMs:performance.now()-start,passed:results.every(spec.accept),calls:requests.length,questions:requests.reduce((n,r)=>n+r.questions,0),requestBytes:requests.reduce((n,r)=>n+r.requestBytes,0),peakConcurrent:peak,requests,capacityBefore:live?capacityBefore:undefined,paid:live,inputTokens:live?requests.reduce((n,r)=>n+(r.usage?.input_tokens??0),0):null,outputTokens:live?requests.reduce((n,r)=>n+(r.usage?.output_tokens??0),0):null,missingUsage:requests.filter(r=>!r.usage).length,results:results.map(r=>({selected:r.selected?.map(t=>t.id),run:r.run,verdict:r.verdict,omittedCallIds:r.omittedCallIds,reusedJudgments:r.reusedJudgments,judgmentSources:r.judgments?.map(j=>j.source)}))};
   rows.push(row);console.log(JSON.stringify({case:row.case,variant,elapsedMs:Math.round(row.elapsedMs),calls:row.calls,questions:row.questions,passed:row.passed,paid:live}));
  }finally{store.close();}
 }
}
writeFileSync(join(out,prefix+'-results.json'),JSON.stringify({plan,rows},null,2)+'\n');
if(rows.some(r=>!r.passed))process.exitCode=1;
