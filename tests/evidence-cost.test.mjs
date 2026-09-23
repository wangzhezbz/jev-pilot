import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../src/core.mjs';import {selectEvidence,recall} from '../src/evidence.mjs';import {modelResult} from '../src/model-result.mjs';
test('full coverage preserves chronology, protected contradictions and exact recoverable bodies',async t=>{
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-cost-test-'))});t.after(()=>store.close());
 const items=[{id:'before',text:'Earlier evidence '+'x'.repeat(1200),source:'log',startLine:1},{id:'after',text:'Later error contradicts the earlier hypothesis',source:'log',startLine:2},{id:'last',text:'Resolution',source:'log',startLine:3}];
 const ctx={store,project:'p',config:{},judge:{classify:async rows=>rows.map(x=>({id:x.id,choice:'keep',source:'jev',probabilities:{keep:1,review:0,exclude:0}}))}};
 const r=await selectEvidence(ctx,{goal:'Preserve evidence',items,budget:500000});
 assert.deepEqual(r.items.map(x=>x.id),items.map(x=>x.id));assert.equal(r.deferredIds.length,0);
 const wire=modelResult('filter_output',r);assert.equal(wire.items[0].startLine,1);assert.equal(wire.items[1].protected,true);assert.equal(wire.completeCoverage,true);
 for(const x of items)assert.equal(JSON.stringify(wire).split(x.text).length-1,1);
 assert.deepEqual(recall(ctx,{artifactId:wire.artifactId}).items,items);assert.equal(r.items[0].text,items[0].text);
});
test('compaction wire retains constraints once; recall and non-evidence operations keep original fields',()=>{
 const original={context:'[user a]\nKeep all constraints',blocks:[{id:'a',role:'user',content:'Keep all constraints',pin:true}],originalId:'saved',nativeHistoryChanged:false};
 const wire=modelResult('compact',original);assert.equal(JSON.stringify(wire).split('Keep all constraints').length-1,1);assert.equal(wire.blocks[0].pin,true);assert.equal(wire.nativeHistoryChanged,false);assert.equal(original.blocks[0].content,'Keep all constraints');
 assert.equal(modelResult('recall',original),original);assert.equal(modelResult('select',{items:[]}).items.length,0);
});
