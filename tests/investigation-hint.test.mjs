import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {investigationHint,INVESTIGATION_HINT,LARGE_TEXT_HINT} from '../src/investigation-hint.mjs';
import {Store} from '../src/core.mjs';
import {createAutomation} from '../src/automation.mjs';
test('hint is absent on a small workspace and exact/mechanical requests',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-hint-'));writeFileSync(join(root,'a.md'),'x'.repeat(20000));
 assert.equal(await investigationHint(root,'Inspect the workspace'),null);
 for(let i=0;i<8;i++)writeFileSync(join(root,`doc-${i}.md`),'x'.repeat(2500));
 for(const prompt of ['Hello','Translate this sentence','Inspect and return exact output','检查并原样输出','Find a restaurant for dinner'])assert.equal(await investigationHint(root,prompt),null);
});
test('hint is bounded metadata guidance, with no source bodies or generated user instructions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-hint-'));
 for(let i=0;i<8;i++)writeFileSync(join(root,`doc-${i}.md`),'DO_NOT_COPY_SOURCE '+('x'.repeat(2500)));
 const r=await investigationHint(root,'Reconcile current policy from the documents');
 assert.equal(r?.context,INVESTIGATION_HINT);assert(r.eligibleFiles>=8);assert(!r.context.includes('DO_NOT_COPY_SOURCE'));
});
test('automation only submits the hint for a confirmed available tool and respects disable',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jev-hint-')),store=new Store({home:mkdtempSync(join(tmpdir(),'jev-hint-state-'))});
 for(let i=0;i<8;i++)writeFileSync(join(root,`doc-${i}.md`),'x'.repeat(2500));
 let available=false,calls=0;
 const auto=createAutomation({store,evidenceAvailable:async()=>available,send:async()=>{calls++;throw Error('MUST_NOT_CALL_MODEL');}});t.after(()=>auto.close());
 const payload={cwd:root,session_id:'s',turn_id:'t',hook_event_name:'UserPromptSubmit',prompt:'Inspect current policy documents'};
 assert.deepEqual(await auto.hook(payload),{});available=true;
 assert.deepEqual(await auto.hook(payload),{hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:INVESTIGATION_HINT}});
 store.put(store.project(root),'config',{enabled:false},'settings');assert.deepEqual(await auto.hook(payload),{});assert.equal(calls,0);
});
test('named large prose gets bounded guidance even for a single-file analysis',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-single-hint-'));
 writeFileSync(join(root,'incident.log'),'SOURCE_NOT_TO_BE_READ '.repeat(1800));
 for(const prompt of ['Analyze incident.log and write findings.data','分析 incident.log 中的问题','Analyse `incident.log` and cite the evidence','Analyze incident.log.','Analyze incident.log. Cite sources.']){
  const r=await investigationHint(root,prompt);assert.equal(r?.context,LARGE_TEXT_HINT);assert.equal(r.eligibleFiles,1);assert(r.observedBytes>16000);assert(!r.context.includes('SOURCE_NOT_TO_BE_READ'));
 }
 for(const prompt of ['Analyze other.log','Analyze myincident.log','Analyze incident.log.bak','Analyze incident.log with exact output','分析 incident.log 并完整输出'])assert.equal(await investigationHint(root,prompt),null);
});
test('explicit prose beyond the metadata sample wins over a generic workspace hint',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-deep-hint-'));
 mkdirSync(join(root,'docs','deep'),{recursive:true});
 for(let i=0;i<160;i++)writeFileSync(join(root,'docs','deep',`note-${i}.md`),'x'.repeat(2500));
 const paths=execFileSync('rg',['--no-config','--files','--null'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const target=paths.at(-1);writeFileSync(join(root,target),'SOURCE_NOT_TO_BE_READ '.repeat(1000));
 const result=await investigationHint(root,`Analyze ${target} in this repository.`);
 assert.equal(result?.context,LARGE_TEXT_HINT);assert.equal(result.eligibleFiles,1);
 assert(!result.context.includes('SOURCE_NOT_TO_BE_READ'));
});
test('single-file hint excludes small, oversized, structured and code sources',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-single-hint-'));
 for(const [name,size] of [['small.log',1000],['huge.log',100001],['data.json',20000],['code.mjs',20000]]){
  writeFileSync(join(root,name),'x'.repeat(size));assert.equal(await investigationHint(root,`Analyze ${name}`),null);
 }
 writeFileSync(join(root,'report.md'),'x'.repeat(20000));assert.equal((await investigationHint(root,'Review report.md'))?.context,LARGE_TEXT_HINT);
});
test('bounded broad-workspace metadata sampling includes a late documentation subtree',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-spread-hint-'));
 for(let i=0;i<160;i++)writeFileSync(join(root,`entry-${i}.md`),'small');
 const paths=execFileSync('rg',['--no-config','--files','--null'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const name of paths.slice(-32))writeFileSync(join(root,name),'DO_NOT_READ_SOURCE '.repeat(150));
 const r=await investigationHint(root,'Inspect this workspace and reconcile the policy');
 assert.equal(r?.context,INVESTIGATION_HINT);assert(r.eligibleFiles<=80);assert(!r.context.includes('DO_NOT_READ_SOURCE'));
});
test('focused lookups avoid an automatic MCP detour while broad reviews and named prose retain guidance',async()=>{
 const root=mkdtempSync(join(tmpdir(),'jev-focused-hint-'));
 for(let i=0;i<10;i++)writeFileSync(join(root,`doc-${i}.md`),'x'.repeat(3000));
 for(const prompt of ['Find how production handles repeated refunds in this repository','Locate the refund implementation in the code','Trace the current policy files','定位仓库里的退款实现'])assert.equal(await investigationHint(root,prompt),null);
 assert.equal((await investigationHint(root,'Review this repository policy'))?.context,INVESTIGATION_HINT);
 writeFileSync(join(root,'incident.log'),'x'.repeat(20000));
 assert.equal((await investigationHint(root,'Find the cause in incident.log'))?.context,LARGE_TEXT_HINT);
});
test('single-file hint still requires tool availability and makes no paid call',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jev-single-hint-')),store=new Store({home:mkdtempSync(join(tmpdir(),'jev-single-state-'))});
 writeFileSync(join(root,'incident.log'),'x'.repeat(20000));let available=false,calls=0;
 const auto=createAutomation({store,evidenceAvailable:async()=>available,send:async()=>{calls++;throw Error('NO_PAID_HINT');}});t.after(()=>auto.close());
 const payload={cwd:root,session_id:'single',turn_id:'t',hook_event_name:'UserPromptSubmit',prompt:'Analyze incident.log'};
 assert.deepEqual(await auto.hook(payload),{});available=true;assert.equal((await auto.hook(payload)).hookSpecificOutput.additionalContext,LARGE_TEXT_HINT);
 store.put(store.project(root),'config',{enabled:false},'settings');assert.deepEqual(await auto.hook(payload),{});assert.equal(calls,0);
});
