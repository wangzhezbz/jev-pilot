import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {investigationHint,INVESTIGATION_HINT} from '../src/investigation-hint.mjs';
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
