// Post-benchmark module integration using a real benchmark deliverable.
// Paid Jev calls, no new GPT inference; does not replace any original result.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,loadKey} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome} from '../../src/setup.mjs';
import {tasks,validatorSources} from '../benchmark/tasks.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const benchmark=process.argv.find(x=>x.startsWith('--benchmark='))?.slice(12)||'dist/acceptance-v10-20260923';
const output=process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'docs/reports/validation-20260923/engineering-evidence.json';
const records=JSON.parse(await readFile(join(benchmark,'results.json'),'utf8')).records;
assert.equal(records.length,48,'Run after the preregistered experiment');
const original=tasks.find(t=>t.id==='bug_fix'),source=records.find(r=>r.id==='gpt-6-astra-bug_fix-0-fixed');
const base=await mkdtemp(join(tmpdir(),'jev-engineering-evidence-')),workspace=join(base,'workspace');await mkdir(workspace);
for(const [name,value]of Object.entries(original.files))await writeFile(join(workspace,name),value);
for(const name of ['singleflight.mjs','diagnosis.md'])await writeFile(join(workspace,name),source.artifacts[name]);
const code=`import assert from 'node:assert/strict';import * as fs from 'node:fs/promises';import * as url from 'node:url';${validatorSources.bug_fix}\nconsole.log('PASS: same-key identity, different-key independence, success and rejection cleanup, rejection delivery, retry, plain values, synchronous throw conversion, and no orphaned unhandled rejection.');`;
await writeFile(join(workspace,'independent-contract.mjs'),code);
const key=loadKey(installHome()),store=new Store({home:join(base,'private')}),pilot=new Pilot({store,key}),calls=[],checks=[];
const call=async(operation,input={})=>{const result=await pilot.call({workspace,operation,input});calls.push({operation,result});return result;};
async function test(id,fn){try{await fn();checks.push({id,passed:true});}catch(e){checks.push({id,passed:false,error:e.code||e.message});}}
let receipt;
await test('actual_engineering_receipt',async()=>{
 const r=await call('run_checks',{checks:[{id:'singleflight-contract',command:process.execPath,args:['independent-contract.mjs']}],files:['singleflight.mjs','independent-contract.mjs','repro.mjs','diagnosis.md']});
 receipt=r.results[0];assert.equal(receipt.status,'passed');
 const supported=await call('verify_completion',{requirements:[{id:'contract',text:'The current singleflight implementation passes the local contract checks covering same-key shared Promise, independent keys, cleanup after both outcomes, retries, plain returns, synchronous exceptions, and no orphaned unhandled rejection.'}],receiptIds:[receipt.id]});
 assert.equal(supported.verdict,'evidence_supported');
});
await test('unrelated_completion_claim_rejected',async()=>{
 assert(receipt);const r=await call('verify_completion',{requirements:[{id:'unproven',text:'This check demonstrates that every real production workload saves at least 30% of GPT tokens.'}],claims:'The task is fixed, therefore production token savings are guaranteed.',receiptIds:[receipt.id]});assert.equal(r.verdict,'needs_review');
});
await test('changed_source_invalidates_engineering_receipt',async()=>{
 await writeFile(join(workspace,'singleflight.mjs'),original.files['singleflight.mjs']);
 const r=await call('verify_completion',{requirements:[{id:'contract',text:'The current singleflight implementation passes the singleflight contract checks.'}],receiptIds:[receipt.id]});assert.equal(r.verdict,'needs_review');assert(r.receipts.every(x=>!x.current));
});
await test('actual_incident_wording_overclaim_detected',async()=>{
 const r=await call('quality',{content:'In the follow-up, all 200 observed checkouts succeeded (zero 503s).',rules:[{id:'observation-boundary',text:'The complete supporting observation is: 200 checkouts, 0 returned 503, latency p95 110 ms. Do not broaden absence of 503 responses into all requests succeeded or no other failures. Mark any such broader claim as failing this rule.'}]});
 assert.equal(r.verdict,'needs_review');assert.equal(r.checks[0].choice,'fail');
});
await test('long_multiphase_context_handoff',async()=>{
 const blocks=[{id:'system',role:'system',content:'Preserve task constraints. Do not claim settlement safety without measurements.'},{id:'earlier-task',role:'user',content:'The completed dashboard palette review is historical context; now investigate checkout connection waits.'}];
 const pair=(id,content,options={})=>blocks.push({id:id+'-call',role:'tool_call',callId:id,readOnly:true,verified:true,status:'completed',content:'Read '+id,...options},{id:id+'-result',role:'tool_result',callId:id,status:'completed',content});
 for(let i=0;i<10;i++)pair('closed-palette-'+i,Array.from({length:22},(_,n)=>`Completed visual palette review group ${i} sample ${n}: decorative blue, cream and amber swatches aligned on the static marketing dashboard; contrast comparison accepted; no open action.`).join('\n'));
 pair('pool-evidence','The pool limit changed from 32 to 4; twelve checkout connections exceeded their wait budget. Returning to 32 removed observed 503s. Settlement impact is unknown.');
 pair('counter-evidence','All 80 hostname lookups succeeded. DNS was an earlier unsupported hypothesis, contradicted by the resolver audit.');
 pair('write-config','Configuration written; this side effect must remain visible.',{readOnly:false});
 pair('failed-check','error: load test failed to connect; result is not a pass.');
 pair('pending-check','Settlement investigation pending; no outcome yet.',{status:'pending'});
 pair('source-location','Prior review refers to dashboard.mjs; retain the source location even though that work is completed.');
 blocks.push({id:'latest',role:'user',content:'Continue diagnosing the pool regression, retain contradictory evidence and outstanding verification.'});
 const input={goal:'Diagnose checkout connection pool regression and verify recovery without overstating settlement impact.',blocks,preserveRecent:1,session:'engineering-long-context'};
 const r=await call('compact',input);assert.equal(r.nativeHistoryChanged,false);
 const keep=new Set(['system','earlier-task','latest',...['pool-evidence','counter-evidence','write-config','failed-check','pending-check','source-location'].flatMap(x=>[x+'-call',x+'-result'])]);
 for(const id of keep)assert(r.blocks.some(b=>b.id===id),id);
 const original=await call('recall',{artifactId:r.originalId});assert.deepEqual(original.items.map(({text,...b})=>b),blocks);
 for(const id of new Set(blocks.filter(b=>b.callId).map(b=>b.callId)))assert([0,2].includes(r.blocks.filter(b=>b.callId===id).length),'Whole exchanges must remain paired');
 assert(r.inputBytes>30000);assert(!r.degraded);assert(r.outputBytes<=r.inputBytes*.6,'Prespecified target: at least 40% fewer handoff bytes');
 const before=store.events(store.project(workspace),10000).filter(e=>e.kind==='jev_call').length;
 const again=await call('compact',input);assert(again.reusedJudgments>0);assert.equal(store.events(store.project(workspace),10000).filter(e=>e.kind==='jev_call').length,before);
});
const result={at:new Date().toISOString(),kind:'post_benchmark_engineering_integration',sourceRun:source.id,gptCalls:0,checks,calls,events:store.events(store.project(workspace),10000),note:'Separate diagnostic using a copied real deliverable. It does not change original benchmark acceptance or prove these advisory checks run automatically in every task.'};
const text=JSON.stringify(result,null,2).replace(/\/Users\/[^/\s]+/g,'<user-home>').replace(/\/(?:private\/)?var\/folders\/[^\s"']+/g,'<private-temp-path>');
assert(!text.includes(key));await writeFile(output,text+'\n');pilot.close();
console.log(JSON.stringify(checks));if(checks.some(x=>!x.passed))process.exitCode=1;
