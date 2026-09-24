// One bounded real Jev integration check, no GPT calls or performance comparison.
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,loadKey,hash} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome} from '../../src/setup.mjs';
import {investigationTasks} from './investigation-tasks.mjs';
import {measuredTransport} from './transport-timing.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/investigation-live-20260924');
await mkdir(out,{recursive:true});
const root=await mkdtemp(join(tmpdir(),'jev-investigation-live-')),store=new Store({home:await mkdtemp(join(tmpdir(),'jev-investigation-live-state-'))});
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const timings=[];
const pilot=new Pilot({store,key,...(process.argv.includes('--timings')?{send:measuredTransport(x=>timings.push(x))}:{})}),task=investigationTasks[0],files={};
for(const [path,body]of Object.entries(task.files)){
  // Source-labelled lines deliberately exercise semantic filtering rather than
  // the byte-identical shared-line path. This is not a savings benchmark.
  const id=body.match(/^# (\w+)/)[1];files[path]=body.split('\n').map(line=>line?`[${id}] ${line}`:line).join('\n');
  await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),files[path]);
}
store.put('global','config',{cacheMs:0},'settings');
const protocol={at:new Date().toISOString(),sourceHash:hash(files),sourceHashes:Object.fromEntries(await Promise.all(['src/core.mjs','src/evidence.mjs','src/investigate.mjs','scripts/acceptance/investigation-live.mjs'].map(async p=>[p,hash(await readFile(p,'utf8'))]))),sourceLabelsAdded:true,maxJevCalls:2,gptCalls:0,scope:'Single live integration/retention check on a source-labelled development fixture; not task latency, token savings or natural adoption evidence.'};
await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
let result;
try{
 const started=performance.now();
 const r=await pilot.call({workspace:root,operation:'investigate',input:{goal:'Find original evidence to reconcile the current Atlas outbound webhook delivery retry contract with its production correction and distinguish the superseded archived design. Retain the original production rules, the correction and the archived proposal; unrelated Atlas components are not needed.',queries:['Atlas'],paths:['notes'],budget:16000}});
 const recall=await pilot.call({workspace:root,operation:'recall_output',input:{artifactId:r.artifactId}});
 const required=['notes/n01.md','notes/n06.md','notes/n09.md'],retained=r.items.map(x=>x.source),calls=store.events(store.project(root)).filter(e=>e.kind==='jev_call');
 result={protocol,elapsedMs:performance.now()-started,selection:r.selection,retainedSources:retained,excluded:r.excludedIds.length,missingRequired:required.filter(p=>!retained.includes(p)),deferred:r.deferredIds,completeCoverage:r.completeCoverage,degraded:r.degraded,recallMatchesSnapshots:recall.items.every(x=>x.text===files[x.source].split('\n').slice(x.startLine-1,x.endLine).join('\n')),transportTimings:store.events(store.project(root)).filter(e=>e.kind==='transport_timing'),profiles:store.events(store.project(root)).filter(e=>e.kind==='classification_batches'),calls};
 result.passed=result.selection.method==='jev'&&calls.length>0&&calls.length<=2&&!result.missingRequired.length&&!result.deferred.length&&!result.degraded&&result.recallMatchesSnapshots&&calls.every(c=>c.status==='success');
}catch(e){result={protocol,passed:false,error:e.code??e.message,calls:store.events(store.project(root)).filter(e=>e.kind==='jev_call')};}
finally{pilot.close();}
if(process.argv.includes('--timings'))result.timings=timings;
const body=JSON.stringify(result,null,2);if(body.includes(key))throw Error('SECRET_IN_RESULT');await writeFile(join(out,'result.json'),body+'\n');console.log(body);if(!result.passed)process.exitCode=1;
