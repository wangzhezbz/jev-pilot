import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import * as host from '../src/host-browser-session.mjs';import {Store,hash} from '../src/core.mjs';
import {runWindowsJevAcceptance} from '../scripts/windows-jev-loop-acceptance.mjs';

function fixture(t,{final='9',review=false,initial='0'}={}){
 const root=mkdtempSync(join(tmpdir(),'jev-loop-acceptance-')),workspace=join(root,'workspace');mkdirSync(workspace);
 const store=new Store({home:join(root,'state')});t.after(()=>store.close());
 const answers=['2','加','7','等于'],executed=[],payloads=[];let index=0;
 const states=[{result:initial,expression:null},{result:'2',expression:null},{result:'2',expression:'2 +'},{result:'7',expression:'2 +'},{result:'9',expression:null}];
 const driver={kind:'computer-use',progressRecheck:'calculator_keys',
  observe:async()=>{const s={...states[index],ambiguous:false},snapshot=JSON.stringify(s);return{snapshot,semanticHash:hash(snapshot),observedAt:Date.now(),calculatorState:s,candidates:['7','加','2','等于'].map((text,i)=>({id:'b'+i,text,target:i,op:'click'}))};},
  execute:async a=>{executed.push(a.text);assert.equal(a.text,answers[index]);index++;}};
 const simulatedHost={...host,createSession:options=>host.createSession({...options,key:'test-fixture',send:async payload=>{
  payloads.push(payload);const criteria=payload.questions.next.criteria;
  const choice=review?'review':Object.keys(criteria).find(k=>criteria[k].text===answers[index]);
  return{model:'mock-only-not-real-Jev',answers:{next:{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(criteria).map(k=>[k,k===choice?1:0]))}},usage:{input_tokens:100,output_tokens:10}};
 }})};
 return {options:{host:simulatedHost,driver,store,workspace,taskId:'local-test-only',readIndependent:async()=>({result:final,expression:null,ambiguous:false})},executed,payloads};
}
test('real session machinery follows simulated model choices, including alternate operand order',async t=>{
 const f=fixture(t),r=await runWindowsJevAcceptance(f.options);
 assert.equal(r.status,'passed');assert.deepEqual(f.executed,['2','加','7','等于']);assert.equal(r.calls.length,4);
 assert.equal(r.receipt.metrics.jevRequests,4);assert.equal(r.calls[0].model,'mock-only-not-real-Jev');
 assert.ok(f.payloads.every(p=>p.state.goal===f.payloads[0].state.goal));assert.equal(f.payloads[0].state.history.length,0);assert.equal(f.payloads[3].state.history.length,3);
});
test('independent wrong final result cannot be reported as acceptance',async t=>{
 const f=fixture(t,{final:'2'}),r=await runWindowsJevAcceptance(f.options);assert.equal(r.status,'not_passed');assert.equal(r.independent.result,'2');
});
test('model review stops without any native fallback actions',async t=>{
 const f=fixture(t,{review:true}),r=await runWindowsJevAcceptance(f.options);assert.equal(r.status,'not_passed');assert.equal(f.executed.length,0);assert.equal(f.payloads.length,1);
});
test('initial nonzero state causes no model request',async t=>{
 const f=fixture(t,{initial:'7'}),r=await runWindowsJevAcceptance(f.options);assert.equal(r.status,'initial_state_not_zero');assert.equal(f.payloads.length,0);assert.equal(f.executed.length,0);
});
