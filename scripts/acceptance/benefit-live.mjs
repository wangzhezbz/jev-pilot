// Predeclared, bounded paid Jev probe; no GPT calls and no retries after a failed observation.
// Two synthetic log orderings + one bounded quality request, at most five Jev HTTP calls.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store,loadKey,hash} from '../../src/core.mjs';import {installHome} from '../../src/setup.mjs';import {createAutomation} from '../../src/automation.mjs';import {Pilot} from '../../src/pilot.mjs';
const dir='docs/reports/benefit-admission-20260923';mkdirSync(dir,{recursive:true});
const key=loadKey(installHome());if(!key)throw new Error('MISSING_KEY');
const root=mkdtempSync(join(tmpdir(),'jev-benefit-live-')),store=new Store({home:join(root,'private')}),pilot=new Pilot({store,key}),automation=createAutomation({store,key});
await pilot.call({workspace:root,operation:'configure',input:{cacheMs:0}});
const facts=[
 [58,'10:04 checkout: p95 latency increased from 120ms to 900ms while request volume remained unchanged.'],
 [59,'10:04 checkout: the increased latency began two minutes before the dashboard theme rollout.'],
 [60,'10:05 ledger-pool: available connections reached zero and checkout waits increased.'],
 [178,'10:06 checkout: application CPU remained at 25 percent; database query execution stayed at 8ms.'],
 [179,'10:06 checkout: customers with both old and new dashboard themes showed identical latency.'],
 [180,'10:07 ledger-pool: the max connection setting changed from 40 to 4 at 10:02.'],
 [239,'10:09 ledger-pool: restoring the max connection setting to 40 restored available connections.'],
 [240,'10:10 checkout: p95 returned to 125ms without reverting the dashboard theme.']
];
const lines=Array.from({length:360},(_,i)=>`10:${String(i%60).padStart(2,'0')} inventory-reporter: warehouse catalog shard ${i} processed 25 unchanged product labels.`);for(const [i,line]of facts)lines[i]=line;
const goal='Diagnose the checkout latency incident. Preserve checkout observations, ledger-pool configuration, event timing and evidence for or against the dashboard theme hypothesis. Inventory catalog reporting is a separate unaffected service.';
const fixtures=[{id:'chronological',text:lines.join('\n')},{id:'block_reordered',text:Array.from({length:12},(_,i)=>lines.slice(i*30,i*30+30)).reverse().flat().join('\n')}];
const plan={kind:'predeclared_component_probe',maxJevHttpCalls:5,gptCalls:0,repetitions:1,fixtures:fixtures.map(f=>({id:f.id,sha256:hash(f.text),bytes:Buffer.byteLength(f.text)})),qualityGate:{requiredFacts:facts.map(([,x])=>x),allFactsRetained:true,automaticReplacementApplied:true,minimumWrappedByteReduction:.2},limits:'Synthetic log screening only. No end-to-end GPT comparison, no billing savings inference; failed observations retained, no retry.'};
writeFileSync(join(dir,'live-plan.json'),JSON.stringify(plan,null,2)+'\n');
const rows=[];
for(const f of fixtures){
 const thread='benefit-'+f.id;await automation.hook({cwd:root,session_id:thread,turn_id:'t',hook_event_name:'UserPromptSubmit',prompt:goal});
 const start=performance.now();const result=await automation.hook({cwd:root,session_id:thread,turn_id:'t',hook_event_name:'PostToolUse',tool_use_id:'read',tool_name:'shell',tool_response:f.text});
 const context=result.stopReason??f.text,missing=facts.map(([,x])=>x).filter(x=>!context.includes(x));
 const events=store.events(store.project(root),10000),last=events.find(x=>x.kind==='automatic_output_result');
 rows.push({id:f.id,applied:result.continue===false,allFactsRetained:!missing.length,missing,originalBytes:Buffer.byteLength(f.text),deliveredBytes:Buffer.byteLength(context),elapsedMs:Math.round(performance.now()-start),result:last,passed:result.continue===false&&!missing.length&&Buffer.byteLength(context)<=Buffer.byteLength(f.text)*.8});
}
const quality=await pilot.call({workspace:root,operation:'quality',input:{content:'The test retained all required observations. Whole-task token savings have not been measured.',rules:[{id:'scope',text:'The content must not claim measured whole-task token savings.'}]}});
const metrics=await pilot.call({workspace:root,operation:'metrics'}),calls=store.events(store.project(root),10000).filter(e=>e.kind==='jev_call');await automation.close();
const files=['src/core.mjs','src/evidence.mjs','src/automation.mjs','src/workflows.mjs','runtime/desktop/router.mjs'];
const out={at:new Date().toISOString(),kind:'paid_jev_component_probe',gptCalls:0,rows,quality,metrics,calls,sourceHashes:Object.fromEntries(files.map(f=>[f,hash(readFileSync(f,'utf8'))])),passed:rows.every(x=>x.passed)&&quality.verdict==='passed',limits:plan.limits};
writeFileSync(join(dir,'live.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
