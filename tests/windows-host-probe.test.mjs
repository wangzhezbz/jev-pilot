import test from 'node:test';
import assert from 'node:assert/strict';
import {probeChromeTabs} from '../scripts/windows-host-probe.mjs';

test('returns count and timing without tab titles or URLs; calls the official method once',async()=>{
 let calls=0;const events=[];
 const result=await probeChromeTabs({browser:{tabs:{async list(){calls++;return [{title:'private title',url:'https://private.test'}];}}},emit:x=>events.push(x)});
 assert.equal(calls,1);assert.equal(result.status,'success');assert.equal(result.tabCount,1);
 assert.deepEqual(events.map(x=>x.phase),['tabs_list_started','tabs_list_returned']);
 assert.ok(result.elapsedMs>=0);assert.doesNotMatch(JSON.stringify({result,events}),/private/);
});
test('a returned timeout is distinct from an expired observation budget',async()=>{
 const result=await probeChromeTabs({browser:{tabs:{list(){throw Error('request timed out at https://private.test/token');}}}});
 assert.equal(result.status,'operation_error');assert.equal(result.errorClass,'timeout');
 assert.doesNotMatch(JSON.stringify(result),/private|token/);
});
test('a pending request is not declared cancelled, failed, or retried',async()=>{
 let calls=0,fail;
 const result=await probeChromeTabs({waitMs:5,browser:{tabs:{list(){calls++;return new Promise((_,reject)=>{fail=reject;});}}}});
 assert.equal(result.status,'pending');assert.equal(result.underlyingCallCancelled,false);assert.equal(calls,1);
 fail(Error('late failure'));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
});
test('empty success and unexpected response shape remain distinct',async()=>{
 for(const [value,status]of [[[],'success'],[{},'unexpected_response_shape']]){
  const result=await probeChromeTabs({browser:{tabs:{list:async()=>value}}});assert.equal(result.status,status);
 }
});
test('invalid handles and budgets fail before calling the browser',async()=>{
 await assert.rejects(probeChromeTabs(),/HANDLE/);
 for(const waitMs of [0,45001,NaN,1.5])await assert.rejects(probeChromeTabs({waitMs,browser:{tabs:{list(){throw Error('must not execute');}}}}),/WAIT/);
});

test('retains original error locally and exports bounded safe cause metadata only',async()=>{
 const cause=Object.assign(Error('socket failed at https://private.test'),{code:'ECONNRESET'});
 const original=Object.assign(Error('account secret in C:\\Users\\private\\file',{cause}),{code:'PRIVATE_ACCOUNT_VALUE',status:503});
 let captured;const events=[];
 const result=await probeChromeTabs({browser:{tabs:{list:async()=>{throw original;}}},captureError:e=>{captured=e;},emit:e=>events.push(e)});
 assert.equal(captured,original);assert.equal(captured.cause,cause);assert.equal(result.rawErrorCapturedLocally,true);
 assert.equal(result.causes[0].code,null);assert.equal(result.causes[0].hasUnexportedCode,true);assert.equal(result.causes[0].httpStatus,503);
 assert.equal(result.causes[1].code,'ECONNRESET');assert.doesNotMatch(JSON.stringify({result,events}),/private|secret|ACCOUNT|Users/);
});
test('cause cycles and throwing local capture do not mask the original failure',async()=>{
 const error=Error('timeout');error.cause=error;
 const result=await probeChromeTabs({browser:{tabs:{list:async()=>{throw error;}}},captureError:()=>{throw Error('capture failed');}});
 assert.equal(result.status,'operation_error');assert.equal(result.rawErrorCapturedLocally,false);assert.equal(result.causes.length,1);assert.equal(result.errorClass,'timeout');
});
test('thrown strings are retained locally without leaking messages',async()=>{
 let captured;
 const result=await probeChromeTabs({browser:{tabs:{list:async()=>{throw 'private timeout';}}},captureError:e=>{captured=e;}});
 assert.equal(captured,'private timeout');assert.equal(result.errorClass,'timeout');assert.doesNotMatch(JSON.stringify(result),/private/);
});
