import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../src/core.mjs';import {Pilot} from '../src/pilot.mjs';
test('prepare locally packs all repeated prose, recalls exact original, and still respects disabled/exact gates',async t=>{
 const root=mkdtempSync(join(tmpdir(),'jev-prose-')),store=new Store({home:join(root,'private')});let calls=0;
 const pilot=new Pilot({store,key:'fixture',send:async()=>{calls++;throw Error('unexpected paid call');}});t.after(()=>pilot.close());
 const sentence='An entry records a customer observation, preserving its original provenance and timestamp for the audit investigation.';
 const value=Array.from({length:90},(_,i)=>`## NOTE-${i}\n${sentence} ${sentence} Unique reference ${i}.\n${i===71?'Contradiction: customer disputes the earlier explanation.':'Status remains unresolved.'}\n`).join('\n');
 const call=(operation,input)=>pilot.call({workspace:root,operation,input});
 const r=await call('prepare_output',{goal:'Review the conflicting customer observations',value,source:'notes.md'});
 assert.equal(r.selection.reason,'lossless_projection');assert.equal(r.selection.excludedItems,0);assert.equal(calls,0);assert(r.value.includes('Contradiction: customer disputes'));assert(Buffer.byteLength(r.value)<Buffer.byteLength(value)*.8);
 for(let i=0;i<90;i++)assert(r.value.includes(`NOTE-${i}`));
 assert.equal((await call('recall_output',{artifactId:r.selection.artifactId})).value,value);
 assert.equal((await call('prepare_output',{goal:'Review',value,source:'notes.md',exact:true})).value,value);
 await call('configure',{enabled:false});assert.equal((await call('prepare_output',{goal:'Review',value,source:'notes.md'})).value,value);assert.equal(calls,0);
});
