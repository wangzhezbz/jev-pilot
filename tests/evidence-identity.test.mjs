import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../src/core.mjs';import {selectEvidence,recall} from '../src/evidence.mjs';
function fixture(t,choice='keep'){
  const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-evidence-identity-'))});t.after(()=>store.close());let sent=[];
  const ctx={store,project:'p',config:{},judge:{classify:async rows=>{sent.push(...rows);return rows.map(x=>({id:x.id,choice,source:'jev',probabilities:{keep:choice==='keep'?1:0,review:0,exclude:choice==='exclude'?1:0}}));}}};
  return {ctx,get sent(){return sent;}};
}
test('unfinished status metadata cannot be excluded even by a confident semantic answer',async t=>{
  const f=fixture(t,'exclude');const items=['pending','failed','in_progress','unknown'].map((status,i)=>({id:'s'+i,text:'Settlement verification record '+i,status}));
  const r=await selectEvidence(f.ctx,{goal:'Review settlement status',items});
  assert.deepEqual(r.items.map(x=>x.id),items.map(x=>x.id));assert.equal(f.sent.length,0);assert.deepEqual(r.excludedIds,[]);
});
test('identical bodies from different source locations and observations retain their provenance',async t=>{
  const f=fixture(t);const items=[
    {id:'a',text:'pool_limit=4',source:'before.log',startLine:1},
    {id:'b',text:'pool_limit=4',source:'after.log',startLine:1},
    {id:'c',text:'pool_limit=4',source:'after.log',startLine:9},
    {id:'d',text:'pool_limit=4',source:'after.log',startLine:9,observedAt:42}];
  const r=await selectEvidence(f.ctx,{goal:'Compare observations',items,against:['pool_limit=4']});
  assert.deepEqual(r.items.map(x=>x.id),items.map(x=>x.id));assert.deepEqual(r.duplicateIds,[]);
  assert.deepEqual(recall(f.ctx,{artifactId:r.artifactId}).items,items);
});
test('repeated identical candidate and explicit already-read plain text still deduplicate',async t=>{
  const f=fixture(t);const r=await selectEvidence(f.ctx,{goal:'Read evidence',against:['already read'],items:[
    {id:'a',text:'pool_limit=4',source:'config',startLine:1},
    {id:'b',text:'pool_limit=4',source:'config',startLine:1},
    {id:'c',text:'already read'}]});
  assert.deepEqual(r.items.map(x=>x.id),['a']);assert.deepEqual(r.duplicateIds,['b','c']);assert.equal(f.sent.length,1);
});
