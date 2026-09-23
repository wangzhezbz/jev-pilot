// Paid component A/B: identical requests, only batch scheduling differs. No GPT calls.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store,loadKey,hash,transport} from '../../src/core.mjs';import {installHome} from '../../src/setup.mjs';import {createAutomation} from '../../src/automation.mjs';
const dir='docs/reports/parallel-filter-20260923';mkdirSync(dir,{recursive:true});
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
const fixtures={chronological:lines.join('\n'),reordered:Array.from({length:12},(_,i)=>lines.slice(i*30,i*30+30)).reverse().flat().join('\n')};
const cases=[{pair:0,fixture:'chronological',order:[1,2]},{pair:1,fixture:'reordered',order:[2,1]},{pair:2,fixture:'chronological',order:[2,1]},{pair:3,fixture:'reordered',order:[1,2]}];
const plan={at:new Date().toISOString(),kind:'predeclared_component_scheduling_AB',baselineCommit:'a44a5d4c96a8324a6ddd0c2835ae6a99044747d5',cases,maxJevHttpCalls:16,gptCalls:0,requiredFacts:facts.map(x=>x[1]),qualityGate:'All 8 facts retained, automatic replacement applied, wrapped bytes reduced by at least 20 percent; no retries; include failures.',scope:'Same current implementation with concurrency 1 vs 2; serialized request hashes must match within each pair. Synthetic component timing, not whole Codex task or account savings.'};
writeFileSync(join(dir,'live-plan.json'),JSON.stringify(plan,null,2)+'\n');
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');const rows=[];
for(const c of cases)for(const concurrency of c.order){
 const root=mkdtempSync(join(tmpdir(),'jev-parallel-live-')),store=new Store({home:join(root,'private')}),project=store.project(root);store.put(project,'config',{cacheMs:0},'settings');
 const requests=[];const auto=createAutomation({store,key,batchConcurrency:concurrency,send:async(...args)=>{requests.push(hash(args[0]));return transport(...args);}});
 const base={cwd:root,session_id:'pair'+c.pair+'-c'+concurrency,turn_id:'t'},text=fixtures[c.fixture];
 await auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'Diagnose the checkout latency incident. Preserve checkout observations, ledger-pool configuration, event timing and evidence for or against the dashboard theme hypothesis. Inventory catalog reporting is a separate unaffected service.'});
 const start=performance.now();const result=await auto.hook({...base,hook_event_name:'PostToolUse',tool_use_id:'read',tool_name:'shell',tool_response:text}),elapsedMs=Math.round(performance.now()-start);
 const context=result.stopReason??text,missing=facts.map(x=>x[1]).filter(x=>!context.includes(x)),events=store.events(project,1000),calls=events.filter(x=>x.kind==='jev_call');
 const row={pair:c.pair,fixture:c.fixture,concurrency,elapsedMs,applied:result.continue===false,requiredFactsRetained:8-missing.length,originalBytes:Buffer.byteLength(text),deliveredBytes:Buffer.byteLength(context),calls,requestHashes:requests.sort(),outcome:events.find(x=>x.kind==='automatic_output_result')};
 row.passed=row.applied&&!missing.length&&row.deliveredBytes<=row.originalBytes*.8&&calls.length===2&&calls.every(x=>x.status==='success');rows.push(row);await auto.close();
 writeFileSync(join(dir,'live-rows.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify({pair:row.pair,concurrency,elapsedMs,passed:row.passed}));
}
const sum=(xs,f)=>xs.reduce((s,x)=>s+f(x),0);const arms=[1,2].map(concurrency=>{const xs=rows.filter(x=>x.concurrency===concurrency),calls=xs.flatMap(x=>x.calls);return{concurrency,runs:xs.length,passed:xs.filter(x=>x.passed).length,totalElapsedMs:sum(xs,x=>x.elapsedMs),meanElapsedMs:sum(xs,x=>x.elapsedMs)/xs.length,inputTokens:sum(calls,x=>x.inputTokens??0),outputTokens:sum(calls,x=>x.outputTokens??0),requests:calls.length,failures:calls.filter(x=>x.status!=='success').length,missingUsage:calls.filter(x=>!Number.isFinite(x.inputTokens)||!Number.isFinite(x.outputTokens)).length};});
const pairs=cases.map(c=>{const a=rows.find(x=>x.pair===c.pair&&x.concurrency===1),b=rows.find(x=>x.pair===c.pair&&x.concurrency===2);return{pair:c.pair,identicalRequests:JSON.stringify(a.requestHashes)===JSON.stringify(b.requestHashes),bothPassed:a.passed&&b.passed,serialMs:a.elapsedMs,parallelMs:b.elapsedMs,deltaMs:b.elapsedMs-a.elapsedMs};});
const out={at:new Date().toISOString(),gptCalls:0,arms,pairs,observedElapsedChangePercent:(arms[1].totalElapsedMs/arms[0].totalElapsedMs-1)*100,allQualityPassed:rows.every(x=>x.passed),allRequestsMatched:pairs.every(x=>x.identicalRequests),sourceHashes:Object.fromEntries(['src/core.mjs','src/automation.mjs','src/evidence.mjs'].map(f=>[f,hash(readFileSync(f,'utf8'))])),limitations:plan.scope};writeFileSync(join(dir,'live-summary.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
