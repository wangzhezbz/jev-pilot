import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

export const retryTask={id:'retry_contract',files:{
  'SPEC.md':`Implement requestWithRetry(send, request, options={}) in src/retry.mjs. Always return a Promise. send receives the original request object on every attempt; do not mutate it. Return the final response object unchanged. Retry ONLY status 429 or 503, and ONLY GET/HEAD (case insensitive) or a request with a nonempty Idempotency-Key header (header names case insensitive, whitespace-only values do not count). Other methods/statuses return immediately. A thrown/rejected error propagates unchanged without retry. maxAttempts defaults to 3 and must be an integer 1..5; reject invalid values before calling send. baseDelayMs defaults to 100 and must be a finite nonnegative number. options.sleep is an injected async function and options.now is a clock returning milliseconds. Before retrying, prefer Retry-After from plain-object response.headers: all-digit seconds or a valid HTTP date relative to now(); cap any delay to 2000ms, floor past dates at zero. Invalid Retry-After uses baseDelayMs * 2**retryIndex (first retry index 0), also capped. Never sleep after the final response. No real network is required; use fake send, sleep and now in tests. Preserve exports and files named in this specification.`,
  'src/delay.mjs':`export function retryDelay(headers, index, base, now) {return Number(headers?.['Retry-After'] || base) * 1000;}\n`,
  'src/retry.mjs':`import {retryDelay} from './delay.mjs';\nexport async function requestWithRetry(send, request, options={}) {let result;for(let i=0;i<3;i++){result=await send({...request});if(result.status<400)return result;await options.sleep(retryDelay(result.headers,i,options.baseDelayMs||100,options.now));}return result;}\n`,
  'smoke.mjs':`import assert from 'node:assert/strict';import {requestWithRetry} from './src/retry.mjs';assert.equal((await requestWithRetry(async()=>({status:200}),{method:'GET'})).status,200);console.log('smoke passed');\n`
},prompt:'Repair the retry client according to SPEC.md. Inspect src/, fix the implementation, add and run regression tests along with smoke.mjs, and write diagnosis.md explaining the failure modes and verification. Preserve SPEC.md, smoke.mjs and the public export. Use injected fake transport and time; do not contact external services.'};

export const retryOracle=`import assert from 'node:assert/strict';
import {requestWithRetry as run} from './src/retry.mjs';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function scenario(request,responses,opts={}){let n=0;const waits=[];const frozen=Object.freeze({...request,headers:Object.freeze({...request.headers})});const result=await run(r=>{assert.strictEqual(r,frozen);return responses[n++]??responses.at(-1);},frozen,{sleep:async ms=>waits.push(ms),now:()=>Date.parse('2026-01-01T00:00:00Z'),...opts});return{n,waits,result};}
const ok={status:200},busy={status:503},limited={status:429};
for(const method of ['GET','get','HEAD']){const r=await scenario({method},[busy,limited,ok]);eq(r.n,3);eq(r.waits,[100,200]);assert.strictEqual(r.result,ok);}
for(const method of ['POST','PATCH','DELETE'])for(const headers of [{},{'Idempotency-Key':''},{'IDEMPOTENCY-KEY':'   '}]){const r=await scenario({method,headers},[busy,ok]);eq(r.n,1);eq(r.waits,[]);assert.strictEqual(r.result,busy);}
for(const headers of [{'Idempotency-Key':'key'},{'IDEMPOTENCY-KEY':' key '}]){const r=await scenario({method:'POST',headers},[busy,ok]);eq(r.n,2);}
for(const status of [200,301,400,401,404,408,500,502,504])eq((await scenario({method:'GET'},[{status},ok])).n,1);
for(const [value,expected]of [['0',0],['1',1000],['99',2000],['Thu, 01 Jan 2026 00:00:01 GMT',1000],['Wed, 31 Dec 2025 23:59:59 GMT',0],['broken',100]]){const r=await scenario({method:'GET'},[{status:503,headers:{'rEtRy-AfTeR':value}},ok]);eq(r.waits,[expected]);}
let r=await scenario({method:'GET'},[busy],{maxAttempts:1});eq(r.n,1);eq(r.waits,[]);
r=await scenario({method:'GET'},[busy],{maxAttempts:5,baseDelayMs:800});eq(r.n,5);eq(r.waits,[800,1600,2000,2000]);
r=await scenario({method:'GET'},[busy,ok],{baseDelayMs:0});eq(r.waits,[0]);
for(const maxAttempts of [0,6,1.5,NaN,'3',null]){let n=0;await assert.rejects(run(()=>{n++;return ok;},{method:'GET'},{maxAttempts}));eq(n,0);}
for(const baseDelayMs of [-1,Infinity,NaN,'100',null]){let n=0;await assert.rejects(run(()=>{n++;return ok;},{method:'GET'},{baseDelayMs}));eq(n,0);}
for(const asyncError of [false,true]){const error=new Error('transport failed');let n=0;let p;assert.doesNotThrow(()=>{p=run(()=>{n++;if(asyncError)return Promise.reject(error);throw error;},{method:'GET'},{sleep:async()=>assert.fail('must not sleep')});});assert.ok(p instanceof Promise);await assert.rejects(p,e=>e===error);eq(n,1);}
console.log(JSON.stringify({oracle:'retry-contract',checks}));`;

export async function validateRetry(task,cwd){
  const checks=[];
  for(const name of ['SPEC.md','smoke.mjs'])checks.push({name:'unchanged:'+name,pass:await readFile(`${cwd}/${name}`,'utf8').then(s=>s===task.files[name]).catch(()=>false)});
  const p=spawnSync(process.execPath,['--input-type=module'],{cwd,input:retryOracle,encoding:'utf8',timeout:10000});
  checks.push({name:'independent_contract',pass:p.status===0,detail:(p.stdout+p.stderr).slice(0,5000)});
  checks.push({name:'diagnosis_present',pass:await readFile(`${cwd}/diagnosis.md`,'utf8').then(s=>s.length>100).catch(()=>false)});
  return{pass:checks.every(x=>x.pass),checks};
}
