// Opt-in real Jev component check. Synthetic records only, no GPT invocation.
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {Store,loadKey,hash} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome} from '../../src/setup.mjs';
import {evidenceArguments} from '../../src/evidence-tool.mjs';
import {semanticTask} from './semantic-task.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/semantic-selection');await mkdir(out,{recursive:true});
const home=await mkdtemp(join(tmpdir(),'jev-selection-probe-')),store=new Store({home}),pilot=new Pilot({store,key:loadKey(installHome())});
const source=semanticTask.files['support-notes.md'];await writeFile(join(home,'support-notes.md'),source);
const items=[...source.matchAll(/^## (CASE-\d+)\n([^\n]+)/gm)].map(([_,id,text])=>({id,text,source:'support-notes.md'}));
const expected=['CASE-008','CASE-029','CASE-050','CASE-077','CASE-106','CASE-131','CASE-154','CASE-179'];
const request={workspace:home,operation:'select',input:{goal:'Keep records describing an unintended extra settled payment after repeated checkout which has not been returned. Exclude records with only a hold, only one settled debit, separate intended purchases, or fully received compensation. Retain any ambiguity or contradictory evidence.',items,budget:500000}};
const start=performance.now();let report;
try{
 const selected=await pilot.call(evidenceArguments(request));const ids=selected.items.map(x=>x.id);
 const recalled=await pilot.call(evidenceArguments({workspace:home,operation:'recall',input:{artifactId:selected.artifactId}}));
 const events=store.events(store.project(home));report={kind:'real_jev_readonly_selection_component',gptCalls:0,sourceHash:hash(source),sourceBytes:Buffer.byteLength(source),returnedContextBytes:Buffer.byteLength(selected.context),elapsedMs:Math.round(performance.now()-start),inputRecords:items.length,retainedRecords:ids.length,excludedRecords:selected.excludedIds.length,deferredRecords:selected.deferredIds.length,missedExpected:expected.filter(x=>!ids.includes(x)),recallExact:JSON.stringify(recalled.items)===JSON.stringify(items),completeCoverage:selected.completeCoverage,degraded:selected.degraded,events};report.passed=!report.missedExpected.length&&report.recallExact&&report.completeCoverage&&!report.degraded;
}catch(e){report={passed:false,error:e.code??e.message,events:store.events(store.project(home))};}finally{pilot.close();}
await writeFile(join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
