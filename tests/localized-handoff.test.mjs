import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createChromeDriver,createLocalizedPolicy} from '../src/host-browser-drivers.mjs';
import {defineTask} from '../src/host-browser-session.mjs';
import {compactContext,recall} from '../src/evidence.mjs';
import {Store} from '../src/core.mjs';
import {modelResult} from '../src/model-result.mjs';
const observed=async(lines,policy)=>createChromeDriver({tab:{ax:{get:async()=>`Browser tab: A URL: "https://example.test/a".\n${lines}`,click:async()=>{}}},allowedOrigins:['https://example.test'],policy}).observe();
test('localized allowlist accepts observed equivalents but rejects ambiguity and carries action risk',async()=>{
 const policy=createLocalizedPolicy({actions:[['Read report','阅读报告'],['Delete','删除']]});
 for(const name of ['Read report','阅读报告']){const r=await observed(`1 button ${name}`,policy);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].text,name);assert.equal(r.candidates[0].requiresApproval,false);}
 assert.equal((await observed('1 button Read report\n2 button 阅读报告',policy)).candidates.length,0);
 assert.equal((await observed('1 button 阅读报告并提交',policy)).candidates.length,0);
 assert.equal((await observed('1 button 删除',policy)).candidates[0].requiresApproval,true);
 assert.throws(()=>createLocalizedPolicy({actions:[['A','B'],['B','C']]}),/INVALID_HOST_LOCALIZATION/);
 const risky=createLocalizedPolicy({actions:[['Submit','Envoyer']]});assert.equal((await observed('1 button Envoyer',risky)).candidates[0].requiresApproval,true);
});
test('language alternatives preserve all independent proof requirements and report actual observed evidence',()=>{
 const spec={goal:'Read R91',stages:[{goal:'Find report',until:[{anyOf:['Reports','报告']}]}],proof:['R91',{anyOf:['Approved','已批准']},'diagnostic only'],reject:[{anyOf:['Draft','草案']}]};
 const task=defineTask(spec);spec.proof[1].anyOf.push('Rejected');
 assert(task.stages[0].complete({snapshot:'报告'}));assert.equal(task.verify({snapshot:'R91 已批准 diagnostic only'}).evidence,'R91 | 已批准 | diagnostic only');
 assert.equal(task.verify({snapshot:'R91 Rejected diagnostic only'}).passed,false);
 assert.equal(task.verify({snapshot:'已批准 diagnostic only'}).passed,false);assert.equal(task.invariant({snapshot:'R91 草案'}).ok,false);
 assert.throws(()=>defineTask({...spec,proof:[{anyOf:[]}]}),/INVALID_HOST_LITERAL_PROOF/);
});
test('uncertain compaction retains every exchange while reducing repetitive handoff and supporting exact recall',async t=>{
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-handoff-'))});t.after(()=>store.close());
 const prose='This is a completed read-only catalog observation containing identical background prose for every entry. '.repeat(8);
 const blocks=Array.from({length:12},(_,i)=>[{id:'c'+i,callId:'x'+i,role:'tool_call',content:'Read catalog entry '+i,readOnly:true,verified:true},{id:'r'+i,callId:'x'+i,role:'tool_result',content:prose+'\nUnique entry '+i,status:'completed'}]).flat();
 blocks.push({id:'user',role:'user',content:'Keep constraints and all unknown states'});
 const ctx={store,project:'p',config:{enabled:true,cacheMs:0,evidenceMode:'apply'},judge:{key:'fixture',classify:async rows=>rows.map(x=>({id:x.id,source:'jev',choice:'review',probabilities:{review:1}}))}};
 const input={goal:'Review catalog',blocks,preserveRecent:1};const result=await compactContext(ctx,input);
 assert.deepEqual(result.omittedCallIds,[]);assert.deepEqual(result.blocks,blocks);assert.equal(result.presentation,'lossless_shared_prose');
 assert(result.presentationOutputBytes<result.presentationInputBytes*.4);assert.equal(result.nativeHistoryChanged,false);
 const restored=recall(ctx,{artifactId:result.originalId}).items;assert.deepEqual(restored.map(x=>x.content),blocks.map(x=>x.content));
 const wire=modelResult('compact',result);assert(!wire.blocks.some(x=>'content'in x));assert(wire.context.includes('Keep constraints and all unknown states'));
 ctx.config.evidenceMode='shadow';assert.equal((await compactContext(ctx,input)).presentation,'original');
 ctx.config.evidenceMode='apply';ctx.config.enabled=false;assert.equal((await compactContext(ctx,input)).presentation,'original');
});
test('short and marker-bearing handoffs stay literal',async t=>{
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-small-handoff-'))});t.after(()=>store.close());
 const ctx={store,project:'p',config:{enabled:true},judge:{classify:async()=>[]}};
 for(const content of ['Short constraint','Literal [=S0] source marker']){const r=await compactContext(ctx,{goal:'Keep',blocks:[{id:'u',role:'user',content}]});assert.equal(r.presentation,'original');assert.equal(r.context,'[user u]\n'+content);}
});

test('denying an equivalent name denies the entire localized action',async()=>{
 const policy=createLocalizedPolicy({actions:[['Read report','阅读报告']],denyNames:['Read report']});
 assert.equal((await observed('1 button 阅读报告',policy)).candidates.length,0);
});
