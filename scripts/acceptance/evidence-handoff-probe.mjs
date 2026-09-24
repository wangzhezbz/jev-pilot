// Four bounded real Jev component runs. No GPT calls and no desktop policy changes.
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {Store,Judge,loadKey,loadConfig,hash,transport} from '../../src/core.mjs';
import {selectEvidence,recall} from '../../src/evidence.mjs';
import {modelResult} from '../../src/model-result.mjs';
import {installHome} from '../../src/setup.mjs';
import {offlineGoal,offlineItems,offlineExpected} from './offline-task.mjs';

const run=process.argv.includes('--run');if(!run&&!process.argv.includes('--plan'))throw Error('EXPLICIT_RUN_OR_PLAN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/evidence-handoff-20260924');
const baseline='60f3e595a456d014d5c3653d1eec3145c015b409';
const before=execFileSync('git',['show',`${baseline}:src/evidence.mjs`],{encoding:'utf8'});
const oldModule=before.replace("'./core.mjs'",JSON.stringify(pathToFileURL(resolve('src/core.mjs')).href)).replace("'./policy.mjs'",JSON.stringify(pathToFileURL(resolve('src/policy.mjs')).href));
const oldSelect=(await import('data:text/javascript;base64,'+Buffer.from(oldModule).toString('base64'))).selectEvidence;
const sources=['src/evidence.mjs','src/evidence-handoff.mjs','src/model-result.mjs','src/core.mjs','src/policy.mjs','scripts/acceptance/offline-task.mjs','scripts/acceptance/evidence-handoff-probe.mjs'];
const protocol={at:new Date().toISOString(),runs:4,order:['before','after','after','before'],baseline,sourceHashes:Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(p,'utf8'))]))),fixtureHash:hash(offlineItems),model:'jev-1.13.0',gptCalls:0,cacheMs:0,scope:'Component-only development regression on the existing 48-record synthetic fixture, not held-out or desktop/GPT speed measurement. Baseline and candidate use identical rubrics, thresholds and transport. Compare sequential vs two independent batches and wire presentation. Full recall and fixed required/review sets are safety checks. All attempts retained; stop on first failure.',stopRule:'Stop first degraded result, missing required/review record, changed original or failed request; no retry.'};
if(!run){console.log(JSON.stringify(protocol,null,2));process.exit(0);}
await mkdir(out,{recursive:true});await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');const results=[];
for(const [index,variant] of protocol.order.entries()){
 const home=await mkdtemp(join(tmpdir(),'jev-handoff-probe-')),store=new Store({home}),project=store.project(home);
 const config={...loadConfig(store,project),cacheMs:0,timeoutMs:5000,maxCalls:4};let active=0,peak=0;
 const judge=new Judge({store,project,config,key,send:async(...args)=>{active++;peak=Math.max(peak,active);try{return await transport(...args);}finally{active--;}}});
 const ctx={store,project,config,judge,root:home};const started=performance.now();let record;
 try{
  const result=await (variant==='before'?oldSelect:selectEvidence)(ctx,{goal:offlineGoal,items:offlineItems,budget:500000,requireCompleteJudgment:true});
  const selectionMs=performance.now()-started,wire=modelResult('select',result,{compactEvidence:variant==='after'});
  const ids=result.items.map(i=>i.id),missing=[...offlineExpected.include,...offlineExpected.review].filter(id=>!ids.includes(id));
  const raw=recall(ctx,{artifactId:result.artifactId});
  const query=recall(ctx,{artifactId:result.artifactId,query:'wireless',limit:1});
  const expectedQuery=offlineItems.filter(x=>[x.id,x.source,x.text].some(v=>v.toLowerCase().includes('wireless')));
  const recalled=[...query.items];let next=query.nextOffset;
  while(next!==null){const page=recall(ctx,{artifactId:result.artifactId,query:'wireless',limit:1,offset:next});recalled.push(...page.items);next=page.nextOffset;}
  const events=store.events(project),calls=events.filter(e=>e.kind==='jev_call');
  record={index,variant,selectionMs,peakRequests:peak,retainedIds:ids,excludedIds:result.excludedIds,missingRequired:missing,degraded:result.degraded,completeCoverage:result.completeCoverage,recallExact:JSON.stringify(raw.items)===JSON.stringify(offlineItems),queryExact:JSON.stringify(recalled)===JSON.stringify(expectedQuery),queryBytes:Buffer.byteLength(JSON.stringify(query)),fullRecallBytes:Buffer.byteLength(JSON.stringify(raw)),contextBytes:Buffer.byteLength(wire.context),wireBytes:Buffer.byteLength(JSON.stringify(wire)),jevCalls:calls.length,inputTokens:calls.reduce((n,e)=>n+(e.inputTokens??0),0),outputTokens:calls.reduce((n,e)=>n+(e.outputTokens??0),0),unknownUsage:calls.filter(e=>e.inputTokens==null||e.outputTokens==null).length,failedCalls:calls.filter(e=>e.status!=='success').length,models:[...new Set(calls.map(e=>e.model))]};
  // Same-result presentation control: differences here cannot come from Jev variability.
  const withCoverage={...result,coverage:{total:offlineItems.length,retained:ids.length,excluded:result.excludedIds.length,deferred:result.deferredIds.length,duplicates:result.duplicateIds.length}};
  record.sameResultBeforeBytes=Buffer.byteLength(JSON.stringify(modelResult('select',result)));
  record.sameResultAfterBytes=Buffer.byteLength(JSON.stringify(modelResult('select',withCoverage,{compactEvidence:true})));
  record.passed=!missing.length&&!record.degraded&&record.completeCoverage&&record.recallExact&&record.queryExact&&!record.failedCalls&&!record.unknownUsage;
 }catch(e){record={index,variant,passed:false,error:e.code??e.message,elapsedMs:performance.now()-started};}finally{store.close();}
 results.push(record);await writeFile(join(out,'results.json'),JSON.stringify({protocol,results},null,2));console.log(JSON.stringify(record));
 if(!record.passed){process.exitCode=2;break;}
}
