import test from 'node:test';import assert from 'node:assert/strict';
import {calculatorObservation} from '../src/calculator-observation.mjs';
import {waitForHostObservation} from '../src/host-observation-wait.mjs';
import {probeCalculatorAddition} from '../scripts/windows-calculator-probe.mjs';
import {semanticState} from '../src/host-browser-drivers.mjs';
const ax=(result,expression='')=>`0 窗口 计算器\n 3 文本 运行历史记录${expression?' Value: '+expression:''} ID: 404\n 5 文本 结果 Value: ${result} ID: 150\nThe focused UI element is 5 文本 结果 Value: ${result} ID: 150.`;
test('actual Windows history expression is extracted independently of result and focus',()=>{
 assert.deepEqual(calculatorObservation(ax('7','7 +')),{result:'7',expression:'7 +',ambiguous:false});
 assert.equal(calculatorObservation(ax('0')).expression,null);
 assert.equal(calculatorObservation(ax('2','7 +')).expression,'7 +');
 assert.notEqual(semanticState(ax('7')),semanticState(ax('7','7 +')));
 assert.equal(calculatorObservation(ax('2')+'\n 8 文本 结果 Value: 9 ID: 150').ambiguous,true);
});
test('delayed observations advance only on evidence and do not repeat actions',async()=>{
 let reads=0;const r=await waitForHostObservation({initial:0,observe:async()=>++reads,accept:x=>x===2});
 assert.equal(r.status,'matched');assert.equal(reads,2);
});
test('cancellation and exhausted shared budget prevent further observation',async()=>{
 let reads=0;const ac=new AbortController();setTimeout(()=>ac.abort(),5);
 const r=await waitForHostObservation({initial:0,observe:async()=>++reads,accept:()=>false,signal:ac.signal});
 assert.equal(r.status,'cancelled');assert.equal(reads,0);
 const exhausted=await waitForHostObservation({initial:0,observe:async()=>++reads,accept:()=>false,remainingMs:()=>0});
 assert.equal(exhausted.status,'timeout');assert.equal(reads,0);
});
test('slow reads and identity errors cannot authorize the next action',async()=>{
 let expired=false;
 const r=await waitForHostObservation({initial:0,observe:async()=>{expired=true;return 1;},accept:x=>x===1,remainingMs:()=>expired?-1:1000});
 assert.equal(r.status,'timeout');
 await assert.rejects(waitForHostObservation({initial:0,observe:async()=>{throw Error('HOST_WINDOW_IDENTITY_CHANGED');},accept:()=>false}),/IDENTITY/);
});
test('the Windows delayed digit trace waits for 2 before sending Return',async()=>{
 let step=0,readsAfter=0;const pressed=[];
 const driver={kind:'computer-use',progressRecheck:'calculator_keys',
   observe:async()=>({snapshot:step===0?ax('0'):step===1?ax('7'):step===2?ax('7','7 +'):step===3?ax(++readsAfter<3?'7':'2','7 +'):ax('9'),
     candidates:['7','加','2','等于'].map(text=>({text}))}),
   execute:async action=>{if(action.text==='等于')assert.ok(readsAfter>=3);pressed.push(action.text);step++;}};
 const result=await probeCalculatorAddition({driver,readIndependent:async()=>ax('9')});
 assert.equal(result.status,'passed');assert.deepEqual(pressed,['7','加','2','等于']);assert.equal(result.steps[2].observations[0].expression,'7 +');
});
test('probe refuses unknown initial state and never sends a key',async()=>{
 let calls=0;
 const result=await probeCalculatorAddition({driver:{kind:'computer-use',progressRecheck:'calculator_keys',observe:async()=>({snapshot:ax('5')}),execute:async()=>calls++},readIndependent:async()=>ax('9')});
 assert.equal(result.status,'initial_state_not_zero');assert.equal(calls,0);
});
test('digit never observed prevents Return instead of forcing the sequence',async()=>{
 let step=0;const pressed=[];
 const result=await probeCalculatorAddition({driver:{kind:'computer-use',progressRecheck:'calculator_keys',
  observe:async()=>({snapshot:step===0?ax('0'):step===1?ax('7'):ax('7','7 +'),candidates:['7','加','2','等于'].map(text=>({text}))}),
  execute:async a=>{pressed.push(a.text);step++;}},readIndependent:async()=>ax('2')});
 assert.equal(result.status,'expected_state_not_observed');assert.equal(result.failedLabel,'2');assert.deepEqual(pressed,['7','加','2']);
});
