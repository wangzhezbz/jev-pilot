import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createPooledTransport,poolSupported} from '../runtime/desktop/pooled-transport.mjs';
async function fixture(t,handler){
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const send=createPooledTransport({url:`http://127.0.0.1:${server.address().port}`,request:http.request,makeAgent:options=>new http.Agent(options)});
 t.after(()=>{send.close();server.closeAllConnections();server.close();});return {server,send};
}
test('successive judgments reuse a connection; rotation uses the new key and metrics contain no body or secret',async t=>{
 let connections=0;const keys=[];
 const {server,send}=await fixture(t,(q,r)=>{keys.push(q.headers.authorization);q.resume();q.on('end',()=>r.end('{"model":"fixture"}'));});
 server.on('connection',()=>connections++);const timing=[];
 for(const key of ['fixture_one','fixture_two'])assert.deepEqual(await send({state:'private_body'},key,{env:{},onTiming:x=>timing.push(x)}),{model:'fixture'});
 assert.equal(connections,1);assert.deepEqual(keys,['Bearer fixture_one','Bearer fixture_two']);assert.equal(timing[1].reusedSocket,true);
 assert(!JSON.stringify(timing).includes('fixture_one'));assert(!JSON.stringify(timing).includes('private_body'));assert(timing.every(x=>x.firstByteMs>=0&&x.totalMs>=x.firstByteMs));
});
test('timeouts and cancellation stop once with no hidden POST retry; pre-abort sends nothing',async t=>{
 let requests=0;const {send}=await fixture(t,q=>{requests++;q.resume();});
 await assert.rejects(send({},'fixture',{env:{},timeoutMs:40}),{code:'JEV_TIMEOUT'});assert.equal(requests,1);
 const c=new AbortController();const waiting=send({},'fixture',{env:{},signal:c.signal});setTimeout(()=>c.abort(),40);
 await assert.rejects(waiting,{code:'CANCELLED'});assert.equal(requests,2);
 await assert.rejects(send({},'fixture',{signal:c.signal}),{code:'CANCELLED'});assert.equal(requests,2);
});
test('HTTP failures, redirects, malformed and oversized bodies are bounded and never expose response text',async t=>{
 let mode=401;const {send}=await fixture(t,(q,r)=>{q.resume();r.statusCode=typeof mode==='number'?mode:200;r.end(mode==='large'?'x'.repeat(2000001):'private_invalid_response');});
 for(const [value,code] of [[401,'JEV_AUTH'],[429,'JEV_RATE_LIMIT'],[503,'JEV_SERVER'],[302,'JEV_HTTP_ERROR'],['json','INVALID_RESPONSE'],['large','RESPONSE_LIMIT']]){
  mode=value;await assert.rejects(send({},'fixture',{env:{}}),e=>e.code===code&&e.message===code);
 }
});
test('proxy or TLS configurations unsupported by the native pool keep legacy curl available',()=>{
 assert.equal(poolSupported({},'24.4.0'),false);assert.equal(poolSupported({},'24.5.0'),true);
 assert.equal(poolSupported({ALL_PROXY:'socks5://127.0.0.1:1080'}),false);
 assert.equal(poolSupported({HTTPS_PROXY:'http://127.0.0.1:1080'}),true);
 assert.equal(poolSupported({CURL_CA_BUNDLE:'/private/custom-ca'}),false);
});
test('ALL_PROXY is mapped without changing the caller environment and a changed proxy gets a separate agent',async t=>{
 const configs=[],env={ALL_PROXY:'http://127.0.0.1:12345',NO_PROXY:'127.0.0.1'};
 const server=http.createServer((q,r)=>{q.resume();r.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const send=createPooledTransport({url:`http://127.0.0.1:${server.address().port}`,request:http.request,makeAgent:options=>{configs.push(options);return new http.Agent({keepAlive:true});}});
 t.after(()=>{send.close();server.closeAllConnections();server.close();});
 await send({},'fixture',{env});await send({},'fixture',{env:{...env,ALL_PROXY:'http://127.0.0.1:23456'}});
 assert.equal(env.HTTPS_PROXY,undefined);assert.equal(configs.length,2);assert.equal(configs[0].proxyEnv.HTTPS_PROXY,env.ALL_PROXY);assert.equal(configs[0].proxyEnv.NO_PROXY,'127.0.0.1');
});

test('evidence responses honor the configured total deadline',async t=>{
 const {send}=await fixture(t,(q,r)=>{q.resume();const timer=setTimeout(()=>r.end('{}'),2100);r.on('close',()=>clearTimeout(timer));});
 assert.deepEqual(await send({},'fixture',{env:{},timeoutMs:3000}),{});
});
