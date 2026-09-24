// Opt-in real Jev preparation acceptance on unchanged synthetic A/B fixtures.
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {Store,loadKey,hash} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome} from '../../src/setup.mjs';
import {semanticTask} from './semantic-task.mjs';
import {tasks} from './factorial-tasks.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/v17-evidence-probe');await mkdir(out,{recursive:true});
const records=[];
for(const task of [tasks.find(t=>t.id==='incident'),semanticTask]){
 const home=await mkdtemp(join(tmpdir(),'jev-prepare-probe-')),store=new Store({home}),pilot=new Pilot({store,key:loadKey(installHome())});
 const [path,source]=Object.entries(task.files)[0];await writeFile(join(home,path),source);
 const expected=task.id==='semantic'?['CASE-008','CASE-029','CASE-050','CASE-077','CASE-106','CASE-131','CASE-154','CASE-179']:['L0013','L0062','L0127','L0214','L0305','L0399','L0488','L0532'];
 const goal=task.id==='semantic'?semanticTask.prompt:'Find evidence about the checkout incident: root cause, rejected hypotheses and their contradictory observations, impact, mitigation, verification and unknown scope. Retain original source evidence IDs. Do not discard contradictions or uncertainty.';
 const start=performance.now();let report;
 try{
  const selected=await pilot.call({workspace:home,operation:'prepare_output',input:{goal,path}});
  const recalled=selected.selection.artifactId?await pilot.call({workspace:home,operation:'recall_output',input:{artifactId:selected.selection.artifactId}}):null;
  report={task:task.id,kind:'real_jev_prepare_component',gptCalls:0,sourceHash:hash(source),sourceBytes:Buffer.byteLength(source),returnedBytes:Buffer.byteLength(JSON.stringify(selected)),elapsedMs:Math.round(performance.now()-start),selection:selected.selection,missedExpected:expected.filter(id=>!selected.value.includes(id)),recallExact:recalled?.value===source,events:store.events(store.project(home))};
  report.passed=selected.selection.status==='prepared'&&!report.missedExpected.length&&report.recallExact;
 }catch(e){report={task:task.id,passed:false,error:e.code??e.message,events:store.events(store.project(home))};}finally{pilot.close();}
 records.push(report);console.log(JSON.stringify(report));
}
await writeFile(join(out,'result.json'),JSON.stringify({records},null,2),{flag:'wx'});if(!records.every(r=>r.passed))process.exitCode=1;
