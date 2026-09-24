import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,Judge} from '../src/core.mjs';
import {selectEvidence} from '../src/evidence.mjs';
function fixture(t){
 const store=new Store({home:mkdtempSync(join(tmpdir(),'jev-item-cache-'))});t.after(()=>store.close());
 const config={enabled:true,model:'fixture',maxCalls:12,timeoutMs:2000,cacheMs:60000},calls=[];
 const send=async p=>{calls.push(p);return{model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(k=>[k,{type:'choice',choice:'keep',probabilities:{keep:1,review:0,exclude:0}}]))};};
 const context=(overrides={})=>({store,project:'p',config:{...config,...overrides},judge:new Judge({store,project:'p',config:{...config,...overrides},key:'fixture',send})});
 const items=Array.from({length:8},(_,i)=>({id:'i'+i,source:'s'+i,text:'Observation '+i}));
 const run=(rows=items,goal='Find observations',overrides={})=>selectEvidence(context(overrides),{goal,items:rows,requireCompleteJudgment:true});
 return{store,config,calls,items,context,run};
}
test('reordering reuses individual judgments; one changed candidate pays for one question',async t=>{
 const f=fixture(t);await f.run();assert.equal(f.calls.length,1);
 const r=await f.run([...f.items].reverse());assert.equal(f.calls.length,1);assert.deepEqual(r.items.map(x=>x.id),[...f.items].reverse().map(x=>x.id));
 const changed=f.items.map((x,i)=>i===3?{...x,text:'Updated observation'}:x);await f.run(changed);
 assert.equal(f.calls.length,2);assert.equal(Object.keys(f.calls[1].questions).length,1);assert(f.calls[1].questions.q0.instructions.includes('Updated observation'));
});
test('goal, source, model, rubric and workspace changes invalidate cached evidence; protection remains deterministic',async t=>{
 const f=fixture(t);await f.run();await f.run(f.items,'A different task');assert.equal(f.calls.length,2);
 await f.run(f.items.map((x,i)=>i===0?{...x,source:'different'}:x));assert.equal(Object.keys(f.calls.at(-1).questions).length,1);
 await f.run(f.items,'Find observations',{model:'new-model'});assert.equal(Object.keys(f.calls.at(-1).questions).length,8);
 const n=f.calls.length;await f.run(f.items.map(x=>({...x,pin:true})));assert.equal(f.calls.length,n);
 const judge=f.context().judge;judge.isolateItems=true;
 assert.equal(judge.classificationWork(f.items,'new rubric',{keep:'Yes',exclude:'No'}).cached.length,0);
 const other=f.context().judge;other.project='different-workspace';other.isolateItems=true;
 assert.equal(other.classificationWork(f.items,'new rubric',{keep:'Yes',exclude:'No'}).cached.length,0);
});
test('cache hits need no network budget; disabled mode cannot apply cached exclusions; cacheMs=0 actually recomputes',async t=>{
 const f=fixture(t);await f.run();const r=await f.run(f.items,'Find observations',{maxCalls:0});assert.equal(r.degraded,false);assert.equal(f.calls.length,1);
 await assert.rejects(f.run(f.items,'Find observations',{maxCalls:0,enabled:false}),{code:'CALL_BUDGET'});
 await f.run(f.items,'Find observations',{cacheMs:0});assert.equal(f.calls.length,2);
});
