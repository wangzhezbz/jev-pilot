// Reproducible local before/after probes. No paid API or GPT calls.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {Store} from '../../src/core.mjs';import {selectEvidence} from '../../src/evidence.mjs';
import {Router,effortQuestion,horizonQuestion} from '../../runtime/desktop/router.mjs';
const baseline='5422ad87fa27a99d24558f54f355fc6c2d678042';
async function previous(file){let source=execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'});source=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,quote,path)=>`from '${pathToFileURL(resolve(dirname(file),path)).href}'`);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
const oldEvidence=await previous('src/evidence.mjs'),oldRouter=await previous('runtime/desktop/router.mjs');
const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-benefit-probe-'))});
const ctx={store,project:'fixture',config:{},judge:{classify:async items=>items.map(x=>({id:x.id,choice:'keep',source:'jev',probabilities:{keep:.95,exclude:.03,review:.02}}))}};
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
async function trace(Type,changingProgress){let calls=0;const r=new Type({coalesceMs:0,judge:async()=>{calls++;return{answer:choice(effortQuestion,'medium'),horizon:choice(horizonQuestion,'10')};},request:async()=>({status:'applied'})});r.supported.set('gpt-6-sol',['low','medium','high']);const p={threadId:'s',model:'gpt-6-sol',effort:'medium',input:[{type:'text',text:'Run the agreed verification plan'}]};const t=r.start('s',p);t.turnId='t';await r.routeStart(p);for(let i=0;i<5;i++){r.observe({method:'item/completed',params:{threadId:'s',item:{type:'agentMessage',text:changingProgress?`Inspect a newly discovered dependency ${i}`:`Verification check ${i+1} passed; continuing the agreed verification plan.`}}});await r.hook({session_id:'s',turn_id:'t',hook_event_name:'PostToolUse',tool_use_id:String(i),tool_name:'shell',tool_response:'ok'});}return{calls,finalEffort:t.current};}
const traces=[];for(const changing of [false,true])traces.push({case:changing?'new_published_progress':'mechanical_progress',before:await trace(oldRouter.Router,changing),after:await trace(Router,changing)});
let seed=772;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
const comparisons=[];
for(let trial=0;trial<40;trial++){
 const items=Array.from({length:32},(_,i)=>({id:'i'+i,text:(i%13===0?'Error: ':'')+Array.from({length:20+Math.floor(rand()*60)},()=>['alpha','beta','gamma','delta','epsilon','word'+i][Math.floor(rand()*6)]).join(' ')}));
 const input={goal:'Preserve diverse evidence',items,budget:800+Math.floor(rand()*5000)};
 const before=await oldEvidence.selectEvidence(ctx,input),after=await selectEvidence(ctx,input);
 const ids=r=>({selected:r.items.map(x=>x.id),deferred:r.deferredIds,excluded:r.excludedIds,overflow:r.protectedOverflow});assert.deepEqual(ids(after),ids(before));comparisons.push({trial,identical:true});
}
const cpu=[];
for(const n of [40,80,160]){
 const items=Array.from({length:n},(_,i)=>({id:'i'+i,text:`Record ${i} `+'common evidence alpha beta gamma delta '.repeat(6)}));
 const input={goal:'Review evidence',items,budget:Math.floor(n*100)},row={n,budget:input.budget,beforeMs:[],afterMs:[]};
 for(let rep=0;rep<3;rep++)for(const arm of rep%2?['after','before']:['before','after']){const start=performance.now();await(arm==='before'?oldEvidence.selectEvidence:selectEvidence)(ctx,input);row[arm+'Ms'].push(Math.round((performance.now()-start)*100)/100);}
 cpu.push(row);
}
store.close();
const out={kind:'local_synthetic_before_after',baseline,at:new Date().toISOString(),paidApiCalls:0,gptCalls:0,traces,partialSelectionEquivalence:{cases:comparisons.length,passed:comparisons.every(x=>x.identical)},partialSelectionCpu:cpu,limitations:'Mocked decisions; CPU timing and avoided call counts are not end-to-end model speed or token savings.'};
const dir='docs/reports/benefit-admission-20260923';mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'local.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
