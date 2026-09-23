// Independent coverage completion and diagnostic follow-up; does not replace first-pass failures.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,loadKey} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome} from '../../src/setup.mjs';
import {createAutomation} from '../../src/automation.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const base=await mkdtemp(join(tmpdir(),'jev-followup-')),key=loadKey(installHome()),out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'dist/acceptance-followup');await mkdir(out,{recursive:true});
const store=new Store({home:join(base,'private')}),pilot=new Pilot({store,key}),rows=[];
for(const id of ['search-independent','compaction-diagnostic','automatic-filter-negative-positive','metrics-consistency']){
 const workspace=join(base,id);await mkdir(workspace);const calls=[];const call=async(operation,input={})=>{const result=await pilot.call({workspace,operation,input});calls.push({operation,result});return result;};let pass=true,error;
 try{
 if(id==='search-independent'){
  await writeFile(join(workspace,'incident.txt'),'Checkout pool limit changed from 32 to 4.\nCheckout returned 503.\n');await writeFile(join(workspace,'museum.txt'),'Checkout is the name of a museum display, unrelated to payments.\n');
  const goal='Find the checkout connection pool regression';const r=await call('search',{goal,query:'Checkout'});assert(r.items.some(x=>x.source==='incident.txt'&&x.sourceHash));assert(r.completeCoverage);
  const short=await call('search',{goal,query:'Checkout',maxMatches:1});assert(short.candidateLimitReached);assert.equal(short.completeCoverage,false);
  const missing=await call('search',{goal,query:'NOT_IN_ANY_FILE'});assert.equal(missing.items.length,0);assert(missing.completeCoverage);
 }
 if(id==='compaction-diagnostic'){
  const blocks=[{id:'rule',role:'system',content:'Retain acceptance checks.'},{id:'call',role:'tool_call',callId:'museum',readOnly:true,verified:true,content:'Read the museum opening hours'},{id:'result',role:'tool_result',callId:'museum',content:'The museum opens from 9 AM to 5 PM.'},{id:'write',role:'tool_call',callId:'write',readOnly:false,verified:true,content:'Write configuration'},{id:'written',role:'tool_result',callId:'write',content:'Configuration written.'},{id:'latest',role:'user',content:'Diagnose checkout failure'}];
  const input={goal:'Diagnose checkout connection pool failure',blocks,preserveRecent:1,session:'diagnostic'};const r=await call('compact',input);assert.equal(r.nativeHistoryChanged,false);assert(r.blocks.some(x=>x.id==='rule'));assert(r.blocks.some(x=>x.id==='write'));assert(r.blocks.some(x=>x.id==='written'));assert(r.blocks.some(x=>x.id==='latest'));
  assert.deepEqual((await call('recall',{artifactId:r.originalId})).items.map(({text,...x})=>x),blocks);
  const again=await call('compact',input);assert(again.reusedJudgments>=1);assert(r.omittedCallIds.includes('museum'));
 }
 if(id==='automatic-filter-negative-positive'){
  const automation=createAutomation({store,key});const session='synthetic-automatic-acceptance';
  await automation.hook({cwd:workspace,session_id:session,turn_id:'one',hook_event_name:'UserPromptSubmit',prompt:'Diagnose checkout connection pool regression'});
  const negative=('error protected evidence '+ 'important detail '.repeat(950))+'\n';
  const invoke=(tool_use_id,text)=>automation.hook({cwd:workspace,session_id:session,turn_id:'one',hook_event_name:'PostToolUse',tool_use_id,tool_name:'exec_command',tool_response:text});
  const n=await invoke('negative-1',negative);calls.push({operation:'automatic-negative',result:n});assert.deepEqual(n,{});
  const n2=await invoke('negative-2',negative);calls.push({operation:'automatic-negative-repeat',result:n2});assert.deepEqual(n2,{});
  assert(store.events(store.project(workspace)).some(e=>e.kind==='automatic_output_admission'&&e.reason==='no_benefit_cooldown'));
  // A different goal is an explicitly independent positive-control scenario.
  await automation.hook({cwd:workspace,session_id:session,turn_id:'two',hook_event_name:'UserPromptSubmit',prompt:'Find the payment pool regression cause and rollback evidence'});
  const positive='error payment pool_limit changed to 4, returned to 32 and recovered\n'+'Museum routine exhibit catalog and unrelated decorative pottery description.\n'.repeat(400);
  const p=await automation.hook({cwd:workspace,session_id:session,turn_id:'two',hook_event_name:'PostToolUse',tool_use_id:'positive',tool_name:'exec_command',tool_response:positive});calls.push({operation:'automatic-positive',result:p});assert.equal(p.continue,false);assert(p.stopReason.includes('pool_limit'));
  const ev=store.events(store.project(workspace)).find(e=>e.kind==='automatic_output_filter');assert(ev&&ev.retainedBytes<ev.originalBytes*.8);
  const raw=await call('recall',{artifactId:ev.artifactId});assert.equal(raw.items.map(x=>x.text).join('\n'),positive);
 }
 if(id==='metrics-consistency'){
  const input={question:'Which category?',choices:{service:'Software service problem',other:'Unrelated'},items:[{id:'x',text:'Service connection pool waits are timing out'}]};await call('decide',input);await call('decide',input);
  const m=await call('metrics');const es=store.events(store.project(workspace),10000).filter(e=>e.kind==='jev_call');assert.equal(m.jev.calls,es.length);assert.equal(m.jev.inputTokens,es.reduce((s,e)=>s+(e.inputTokens||0),0));assert.equal(m.jev.outputTokens,es.reduce((s,e)=>s+(e.outputTokens||0),0));assert.equal(m.savings,null);assert(m.cacheHits>0);
 }
 }catch(e){pass=false;error={code:e.code||e.name,message:e.message};}
 const metrics=await call('metrics');rows.push({id,pass,error,calls,metrics,events:store.events(store.project(workspace),10000)});await writeFile(join(out,'followup.json'),JSON.stringify({at:new Date().toISOString(),kind:'diagnostic_and_remaining_coverage_not_replacement',rows},null,2));console.log(JSON.stringify({id,pass,error}));
}
pilot.close();if(rows.some(x=>!x.pass))process.exitCode=1;
