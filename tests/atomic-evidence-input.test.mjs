import test from 'node:test';
import assert from 'node:assert/strict';
import {classificationPayload,classificationPlan,requestFits} from '../src/core.mjs';
test('independent input profile keeps each original candidate in its own question and shared task once',()=>{
 const items=Array.from({length:12},(_,i)=>({id:'p'+i,text:`unique-candidate-${i}: `+('detail '.repeat(450)),source:`note-${i}.md`}));
 const criteria={keep:'Needed evidence',review:'Uncertain',exclude:'Unrelated'},task='Find needed evidence';
 const payload=classificationPayload('fixture',items,task,criteria,{},true);
 assert.deepEqual(payload.state,{task});assert.equal(Object.keys(payload.questions).length,items.length);
 for(const [i,item]of items.entries())assert.deepEqual(JSON.parse(payload.questions['q'+i].instructions.split('\n').at(-1)),item);
 assert(requestFits(payload));assert.equal(classificationPlan('fixture',items,task,criteria,{},true).batches.length,1);
 const legacy=classificationPayload('fixture',items,task,criteria);assert.deepEqual(legacy.state.items,items);assert.match(legacy.questions.q0.instructions,/state.items\[0\]/);
 assert(classificationPlan('fixture',items,task,criteria).batches.length>1);
});
