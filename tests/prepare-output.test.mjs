import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/core.mjs';
import {Pilot} from '../src/pilot.mjs';
import {createAutomation} from '../src/automation.mjs';
import {evidenceArguments,evidenceTool} from '../src/evidence-tool.mjs';
const body='NEEDLE target\n'+('noise '+('x'.repeat(64))+'\n').repeat(350);
function fixture(t,{fail=false,keepAll=false,key='fixture'}={}){
  const home=mkdtempSync(join(tmpdir(),'jev-prepare-')),store=new Store({home});let calls=0;
  const send=async p=>{calls++;if(fail)throw Error('offline');return{model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>{const keep=keepAll||(p.state.items?.[Number(id.slice(1))]??JSON.parse(p.questions[id].instructions.split('\n').at(-1))).text.includes('NEEDLE');return[id,{type:'choice',choice:keep?'keep':'exclude',probabilities:{keep:keep?1:0,review:0,exclude:keep?0:1}}]}))};};
  const pilot=new Pilot({store,key,send});t.after(()=>pilot.close());
  const call=(operation,input)=>pilot.call({workspace:home,operation,input});
  return{home,store,pilot,send,call,calls:()=>calls,prepare:input=>call('prepare_output',{goal:'Find NEEDLE evidence',...input})};
}
test('presentation filters a copy, keeps command metadata and recalls the exact original',async t=>{
  const f=fixture(t),value=Object.freeze({output:body,exit_code:0,wall_time_seconds:.2,chunk_id:'abc'});
  const r=await f.prepare({value,source:'exec_command'});
  assert.equal(r.selection.status,'prepared');assert.equal(r.selection.modelReceipt,'unconfirmed');assert.equal(r.selection.nativeTokenSavings,null);
  assert.equal(value.output,body);assert.equal(r.value.exit_code,0);assert.equal(r.value.chunk_id,'abc');assert(r.value.output.includes('NEEDLE'));assert(r.value.output.length<body.length*.8);
  assert.deepEqual((await f.call('recall_output',{artifactId:r.selection.artifactId})).value,value);assert.equal(f.calls(),1);
});
test('MCP text keeps its envelope; structured, media, annotation and error results are unchanged without judgment',async t=>{
  const f=fixture(t),value={content:[{type:'text',text:body}],isError:false};
  const r=await f.prepare({value,source:'mcp__browser__read'});assert.equal(typeof r.value,'object');assert.equal(r.value.isError,false);assert(r.value.content[0].text.includes('NEEDLE'));
  const calls=f.calls();
  for(const v of [{...value,structuredContent:{a:1}},{...value,isError:true},{content:[...value.content,{type:'image',data:'AA=='}]},{content:[{...value.content[0],annotations:{priority:1}}]},{...value,metadata:{x:1}}])assert.deepEqual((await f.prepare({value:v,source:'mcp__browser__read'})).value,v);
  assert.equal(f.calls(),calls);
});
test('errors, unfinished processes, exact/code/JSON/small output bypass selection',async t=>{
  const f=fixture(t);
  for(const value of [{output:body,exit_code:1},{output:body,session_id:4},{output:body,exit_code:0,session_id:4},JSON.stringify({body}),('id,"a,b",123\r\n').repeat(1100),('a\tb\tc\n').repeat(2500),'small'])assert.deepEqual((await f.prepare({value})).value,value);
  for(const input of [{value:body,exact:true},{value:body,source:'src/index.ts'},{value:body,goal:'Return the exact output'}])assert.equal((await f.prepare(input)).value,body);
  assert.equal(f.calls(),0);
});
test('network errors, missing key, no benefit and disabled mode preserve all bytes',async t=>{
  for(const options of [{fail:true},{key:''},{keepAll:true}]){const f=fixture(t,options);const r=await f.prepare({value:body});assert.equal(r.selection.status,'original');assert.equal(r.value,body);}
  const f=fixture(t);await f.call('configure',{enabled:false});assert.equal((await f.prepare({value:body})).value,body);assert.equal(f.calls(),0);
});
test('file reading respects workspace/private boundaries and raw recall',async t=>{
  const f=fixture(t);writeFileSync(join(f.home,'fixture.log'),body);writeFileSync(join(f.home,'.env.local'),'PRIVATE_SENTINEL');
  const r=await f.prepare({path:'fixture.log'});assert.equal((await f.call('recall_output',{artifactId:r.selection.artifactId})).value,body);
  await assert.rejects(f.prepare({path:'.env.local'}),{code:'PRIVATE_PATH'});
  await assert.rejects(f.prepare({path:'fixture.log',value:body}),{code:'ONE_OUTPUT_SOURCE_REQUIRED'});
  await assert.rejects(f.prepare({path:''}));
});
test('same candidate judgment is cached; repeated raw recall never repeats execution or judgment',async t=>{
  const f=fixture(t),a=await f.prepare({value:body});await f.prepare({value:body});await f.call('recall_output',{artifactId:a.selection.artifactId});await f.call('recall_output',{artifactId:a.selection.artifactId});assert.equal(f.calls(),1);
});
test('read-only evidence dispatch rejects execution and configuration operations',()=>{
  assert.equal(evidenceTool.annotations.readOnlyHint,true);
  for(const operation of ['configure','browser_consume','memory','run_checks','__proto__','constructor'])assert.throws(()=>evidenceArguments({operation}),{code:'READ_ONLY_OPERATION_REQUIRED'});
  assert.equal(evidenceArguments({operation:'prepare',input:{}}).operation,'prepare_output');
  assert.equal(evidenceArguments({operation:'select',input:{}}).operation,'select');
});
test('nested native command hook adds no second judgment; direct hooks remain functional',async t=>{
  const f=fixture(t),auto=createAutomation({store:f.store,key:'fixture',send:f.send});
  const base={cwd:f.home,session_id:'s',turn_id:'t'};
  await auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'Find NEEDLE evidence'});
  const hook={...base,hook_event_name:'PostToolUse',tool_name:'Bash',tool_response:body};
  assert.deepEqual(await auto.hook({...hook,tool_use_id:'exec-01234567-89ab-cdef-0123-456789abcdef'}),{});assert.equal(f.calls(),0);
  const result=await auto.hook({...hook,tool_use_id:'call_direct'});assert.equal(result.continue,false);assert.equal(f.calls(),1);
  const outcome=f.store.events(f.store.project(f.home)).find(e=>e.kind==='automatic_output_result');assert.equal(outcome.submitted,true);assert.equal(outcome.applied,false);
});

test('record boundaries isolate pending evidence while preserving preamble and exact recall',async t=>{
 const f=fixture(t),head='# Support archive\nShared context: one independent report per section\n';
 const records=Array.from({length:90},(_,i)=>`## Record ${i}\n${i===0?'pending NEEDLE':i===1?'NEEDLE':'unrelated resolved notice'} ${'detail '.repeat(30)} source-reference-${i}\n`);
 const source=head+records.join('\n');const r=await f.prepare({value:source,source:'archive.md'});
 assert.equal(r.selection.status,'prepared');assert(r.value.includes(head.trim()));
 assert(r.value.includes('pending NEEDLE'));assert(r.value.includes('## Record 1\n'));
 assert(!r.value.includes('## Record 2\n'));assert(f.calls()>0&&f.calls()<=6);
 assert.equal((await f.call('recall_output',{artifactId:r.selection.artifactId})).value,source);
});
test('large logs retain coverage under the bounded request budget',async t=>{
 const f=fixture(t),source='NEEDLE original\n'+Array.from({length:540},(_,i)=>`${i}: notice ${'x'.repeat(115)}`).join('\n');
 const r=await f.prepare({value:source,source:'service.log'});
 assert.equal(r.selection.status,'prepared');assert(f.calls()>0&&f.calls()<=6);assert(r.value.includes('NEEDLE original'));
 assert.equal((await f.call('recall_output',{artifactId:r.selection.artifactId})).value,source);
});
test('an explicit lower request budget is respected without partial paid filtering',async t=>{
 const f=fixture(t);await f.call('configure',{maxCalls:1});
 const source=Array.from({length:90},(_,i)=>`## Record ${i}\n${i?'notice':'NEEDLE'} ${'detail '.repeat(30)}\n`).join('\n');
 const r=await f.prepare({value:source});assert.equal(r.value,source);assert.equal(f.calls(),0);
});
