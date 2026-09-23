import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataLoader} from '../runtime/desktop/bridge.mjs';
const good={data:[{model:'gpt-6-astra',supportedReasoningEfforts:[{reasoningEffort:'high'}]}]};
test('metadata failure backs off then recovers on a later turn without paid model calls',async()=>{
 let clock=100,calls=0,accepted;const logs=[];
 const load=metadataLoader({clock:()=>clock,log:e=>logs.push(e),accept:rows=>accepted=rows,request:async(method,params,timeout)=>{
  assert.equal(method,'model/list');assert.equal(timeout,1500);if(++calls===1)throw Error('TIMEOUT');return good;
 }});
 await load();await load();assert.equal(calls,1);assert.equal(accepted,undefined);
 assert.equal(logs[0].code,'METADATA_TIMEOUT');clock+=5000;
 await Promise.all([load(),load()]);assert.equal(calls,2);assert.deepEqual(accepted,good.data);
 await load();assert.equal(calls,2);assert.equal(logs[1].kind,'metadata_loaded');assert.equal(logs[1].attempt,2);
});
test('concurrent model list requests share one pending retrieval',async()=>{
 let release,count=0;const load=metadataLoader({request:()=>{count++;return new Promise(r=>release=r);},log:()=>{},accept:()=>{}});
 const a=load(),b=load();assert.equal(count,1);release(good);await Promise.all([a,b]);
});
test('unsupported metadata API is not retried and error text never enters logs',async()=>{
 let calls=0,clock=0;const logs=[];const load=metadataLoader({clock:()=>clock,accept:()=>{},log:e=>logs.push(e),request:async()=>{
  calls++;throw Object.assign(Error('SECRET_SENTINEL'),{rpcCode:-32601});
 }});
 await load();clock=100000;await load();assert.equal(calls,1);assert.equal(logs[0].code,'METADATA_UNSUPPORTED');
 assert(!JSON.stringify(logs).includes('SECRET_SENTINEL'));
});
test('invalid metadata remains unavailable and retry backoff is bounded',async()=>{
 let clock=0;const logs=[];const load=metadataLoader({clock:()=>clock,log:e=>logs.push(e),accept:()=>{throw Error('must not accept');},request:async()=>({data:[]})});
 for(let i=0;i<8;i++){await load();clock+=60000;}
 assert.equal(logs.length,8);assert(logs.every(e=>e.code==='METADATA_INVALID'&&e.retryAfterMs<=60000));
});
