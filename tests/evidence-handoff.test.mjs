import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,Judge} from '../src/core.mjs';
import {selectEvidence,recall} from '../src/evidence.mjs';
import {recallOutput} from '../src/prepare-output.mjs';
import {modelResult} from '../src/model-result.mjs';
import {evidenceHandoff} from '../src/evidence-handoff.mjs';

function fixture(t) {
  const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-handoff-'))});t.after(()=>store.close());
  return {store,project:'p',config:{},judge:{classify:async rows=>rows.map(x=>({id:x.id,type:'choice',choice:x.id==='omit'?'exclude':'keep',confidence:1,source:'jev',probabilities:{keep:x.id==='omit'?0:1,review:0,exclude:x.id==='omit'?1:0}}))}};
}
test('text-only handoff carries coverage, uncertainty and recovery without altering evidence',async t=>{
  const ctx=fixture(t),items=[{id:'keep',text:'Useful record',source:'a.md',status:'completed'},{id:'omit',text:'Other topic',source:'a.md'},{id:'uncertain',text:'pending verification',source:'b.md'}];
  const r=await selectEvidence(ctx,{goal:'Review records',items});
  const wire=modelResult('select',r,{compactEvidence:true});
  assert.match(wire.context,/2\/3 records retained; 1 judged unrelated, 0 budget-deferred/);
  assert.match(wire.context,/not proof that all relevant evidence is present/);
  assert(wire.context.includes(r.artifactId));assert.match(wire.context,/literal query/);
  for(const item of r.items)assert.equal(wire.context.split(item.text).length-1,1);
  assert.equal(wire.items[0].source,'a.md');assert.equal(wire.items[0].status,'completed');
  assert.equal(wire.items[1].protected,true);assert.equal(wire.items[0].judgment.choice,'keep');
  assert.equal(wire.items[0].judgment.probabilities,undefined);
  assert(r.items[0].judgment.probabilities);assert(modelResult('select',r).items[0].judgment.probabilities);
  assert.deepEqual(recall(ctx,{artifactId:r.artifactId}).items,items);
});
test('incomplete or degraded selections never describe the handoff as complete',()=>{
  for(const degraded of [false,true]){
    const s=evidenceHandoff({artifactId:'a',context:'source',completeCoverage:false,degraded,coverage:{total:3,retained:1,excluded:0,deferred:2,duplicates:0}});
    assert.match(s,/2 budget-deferred/);assert.match(s,degraded?/degraded/:/incomplete/);assert(!s.includes('no budget-deferred records'));
  }
});
test('targeted recall searches omitted originals without any judgment and keeps pagination explicit',async t=>{
  const ctx=fixture(t),items=Array.from({length:7},(_,i)=>({id:'s'+i,text:`Archived battery record ${i}`,source:'notes.md',status:'completed'}));
  const artifactId=ctx.store.put(ctx.project,'artifact',{items,originalValue:'EXACT WHOLE ORIGINAL'});
  ctx.judge.classify=()=>assert.fail('recall must not judge');
  const a=recallOutput(ctx,{artifactId,query:'BATTERY',limit:3});
  assert.deepEqual(a.items,items.slice(0,3));assert.equal(a.matchedItems,7);assert.equal(a.nextOffset,3);assert.equal(a.complete,false);
  const b=recallOutput(ctx,{artifactId,query:'battery',limit:3,offset:a.nextOffset});
  const c=recallOutput(ctx,{artifactId,query:'battery',limit:3,offset:b.nextOffset});
  assert.deepEqual([...a.items,...b.items,...c.items],items);assert.equal(c.nextOffset,null);assert.equal(c.complete,true);
  assert.deepEqual(recall(ctx,{artifactId,query:'s4'}).items,[items[4]]);
  assert.deepEqual(recall(ctx,{artifactId,query:'notes.md'}).items,items);
  const missing=recall(ctx,{artifactId,query:'not present'});assert.equal(missing.matchedItems,0);assert.match(missing.scope,/does not prove semantic absence/);
  assert.equal(recallOutput(ctx,{artifactId}).value,'EXACT WHOLE ORIGINAL');
  assert.deepEqual(recallOutput(ctx,{artifactId,ids:['s2']}).items,[items[2]]);
});
test('recall selectors, page limits and project boundaries are enforced',t=>{
  const ctx=fixture(t),artifactId=ctx.store.put(ctx.project,'artifact',{items:[]});
  for(const input of [{query:''},{query:' '},{query:'x',ids:[]},{query:'x',offset:-1},{query:'x',limit:0},{query:'x',limit:101},{query:'x',offset:1.5}])assert.throws(()=>recall(ctx,{artifactId,...input}));
  assert.throws(()=>recall({...ctx,project:'other'},{artifactId,query:'x'}),{code:'ARTIFACT_NOT_FOUND'});
});
test('compact evidence preserves provenance while reducing a realistic multi-record wire response',async t=>{
  const ctx=fixture(t),items=Array.from({length:48},(_,i)=>({id:'s'+i,text:'Independent source observation '+i,source:'archive.md',startLine:i+1,sourceHash:'a'.repeat(64)}));
  const r=await selectEvidence(ctx,{goal:'Review observations',items,budget:500000});
  const full=modelResult('select',r),compact=modelResult('select',r,{compactEvidence:true});
  assert(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(full)));
  for(let i=0;i<items.length;i++)for(const key of ['id','source','sourceHash','startLine'])assert.equal(compact.items[i][key],items[i][key]);
});
test('independent batches overlap at most two requests; a failed batch retains all its originals',async t=>{
  const ctx=fixture(t);let active=0,peak=0,started=0,release;
  const barrier=new Promise(r=>release=r);
  ctx.config={enabled:true,model:'fixture',cacheMs:0,maxCalls:4,timeoutMs:5000};
  ctx.judge=new Judge({...ctx,key:'fixture',send:async p=>{
    const index=started++;active++;peak=Math.max(peak,active);if(started===2)release();
    await barrier;active--;
    if(index===0)throw Error('offline');
    return {model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>[id,{type:'choice',choice:'keep',probabilities:{keep:1,review:0,exclude:0}}]))};
  }});
  const items=Array.from({length:50},(_,i)=>({id:'s'+i,text:'Observation '+i,source:'a.md'}));
  const result=await selectEvidence(ctx,{goal:'Review',items,budget:500000});
  assert.equal(peak,2);assert.equal(started,3);assert.equal(result.degraded,true);
  assert.deepEqual(result.items.map(x=>x.id),items.map(x=>x.id));assert.deepEqual(result.excludedIds,[]);
});
