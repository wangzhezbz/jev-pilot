import {tasks as previous,validate as validatePrevious} from './tasks.mjs';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const cross={id:'cross_file',title:'Tenant isolation, pending requests and rejection recovery',files:{
 'SPEC.md':`createBalanceClient(load) returns get(tenant, account), always a Promise. load receives both original strings. Concurrent requests for the same ordered pair share the identical pending Promise; different pairs are independent even if strings contain ':'. Fulfillment AND rejection clear pending entries so later requests reload. Plain return values and synchronous throws are allowed. No extra unhandled rejection. resolveBalance(client, tenant, account) returns {tenant,account,balanceMinor,currency}; preserve integer minor units and currency, including zero and negative balances. Do not persist fulfilled values.`,
 'src/pending.mjs':`export function singleFlight(load) { const pending=new Map(); return (key,...args)=>{if(pending.has(key))return pending.get(key); const p=Promise.resolve(load(...args));pending.set(key,p);p.then(()=>pending.delete(key));return p;}; }\n`,
 'src/client.mjs':`import {singleFlight} from './pending.mjs';\nexport function createBalanceClient(load) {const get=singleFlight(load);return (tenant,account)=>get(account,tenant,account);}\n`,
 'src/resolve.mjs':`export async function resolveBalance(client,tenant,account) {const value=await client(tenant,account);return {tenant,account,balanceMinor:value.balanceMinor || 100,currency:'USD'};}\n`,
 'smoke.mjs':`import assert from 'node:assert/strict';import {createBalanceClient} from './src/client.mjs';import {resolveBalance} from './src/resolve.mjs';const r=await resolveBalance(createBalanceClient(()=>({balanceMinor:50,currency:'USD'})),'t','a');assert.equal(r.balanceMinor,50);console.log('smoke passed');\n`
},prompt:'Investigate the balance lookup defects across src/. Follow SPEC.md, fix the implementation, add regression tests and run them alongside smoke.mjs. Write diagnosis.md explaining the causes and verification. Preserve existing exports. Do not change SPEC.md or smoke.mjs. Pay particular attention to tenant isolation, request lifetime, error propagation and preservation of monetary values.'};
const incident={...previous.find(t=>t.id==='incident')};
incident.prompt=incident.prompt.replace('First read this log through a shell command with an output limit sufficient for the entire file (at least 25000 output tokens); do not prefilter it yourself. ','');

const repoFiles={'README.md':'Synthetic service monorepo. packages/ contains implementations, config/ selects live behavior, docs/ contains current and historic decisions. Some documents describe superseded deployments.\n'};
for(let n=0;n<180;n++){
 const slug=`component-${String(n).padStart(3,'0')}`;
 repoFiles[`packages/${slug}/index.mjs`]=`export const component='${slug}';\nexport function status(){return {state:'ready',queue:${n%7}};}\n`;
 repoFiles[`docs/${slug}.md`]=`# ${slug}\n`+Array.from({length:8},(_,j)=>`Maintenance observation ${n}-${j}: regional ${['catalog indexing','notification delivery','metrics collection','inventory refresh','session cleanup'][n%5]} uses a bounded worker queue. A repeat request can arrive after client disconnect; this component does not own billing credits. Its rolling window retains telemetry for ${n+1} minutes.`).join('\n');
}
Object.assign(repoFiles,{
 'config/production.mjs':`export default {refundDriver:'credit-v2',dedupWindowSeconds:900,refundStorage:'settlement-log'};\n`,
 'packages/http/credits.mjs':`import {makeCredit} from '../accounting/credit.mjs';\nexport async function postCredit(ctx,request){return makeCredit(ctx,request.headers['x-replay-key'],request.body);}\n`,
 'packages/accounting/credit.mjs':`import {claim} from '../settlement/replay.mjs';\nimport {appendCredit} from '../settlement/log.mjs';\nexport async function makeCredit(ctx,key,body){const ticket=await claim(ctx,key);if(ticket.existing)return ticket.receipt;return appendCredit(ctx,ticket,body);}\n`,
 'packages/settlement/replay.mjs':`export async function claim(ctx,key){return ctx.store.claimUnique({namespace:ctx.tenant,key,expiresSeconds:ctx.config.dedupWindowSeconds});}\n`,
 'packages/settlement/log.mjs':`export async function appendCredit(ctx,ticket,body){return ctx.store.commitCredit(ticket,body);}\n`,
 'packages/legacy/refund-memory.mjs':`const seen=new Map();export function hasCredit(key){return seen.has(key);}export function rememberCredit(key,value){seen.set(key,value);}\n`,
 'docs/adr/017-refund-replays.md':`# Accepted ADR 017\nThe live credit-v2 driver claims the caller's x-replay-key within the tenant namespace in settlement-log before issuing a credit. The uniqueness claim is durable across worker restarts. Production expiration comes from config/production.mjs, not the old memory driver. A matching request within that window receives the stored receipt rather than another credit.\n`,
 'docs/archive/refund-rollout.md':`# Historical draft, superseded by ADR 017\nThe experimental credit-v1 keeps replay keys in process memory for 60 seconds. Restart loses protection. Do not use this document as the current production specification.\n`,
 'docs/ops/late-replay.md':`# Refund replay boundary\nThe current replay record expires after the configured production window. Beyond expiry a second credit is possible; protection is not forever. This fixture contains no deployment measurements, so actual duplicate-credit incidence remains unknown.\n`
});
const localization={id:'repository',title:'Locate authoritative behavior among 370 files',files:repoFiles,prompt:`Find how production prevents issuing a second refund when a client repeats a request after disconnect. Trace the live request path, where the replay key comes from, its isolation scope and durability, and the protection window. Distinguish active behavior from obsolete design notes and explain what is still unknown. Write investigation.md with file-path citations and findings.data containing {driver,header,scope,durable,windowSeconds,expiryRisk,observedIncidence,callChain,evidencePaths}; scope is tenant or global, expiryRisk is possible or impossible, observedIncidence is unknown or measured. callChain is the ordered list of implementation file paths from HTTP handling to both claiming and committing. Do not modify existing files. Use the repository evidence; no need to read every file.`};
export const tasks=[cross,incident,localization];

const hidden=`import assert from 'node:assert/strict';
const {createBalanceClient}=await import('./src/client.mjs');const {resolveBalance}=await import('./src/resolve.mjs');
let unhandled=[];process.on('unhandledRejection',e=>unhandled.push(String(e)));
let calls=[];let releases=[];const get=createBalanceClient((...args)=>{calls.push(args);return new Promise(r=>releases.push(r));});
const a=get('one','account'),a2=get('one','account'),b=get('two','account'),c=get('a:b','c'),d=get('a','b:c');assert.strictEqual(a,a2);assert.notStrictEqual(a,b);assert.notStrictEqual(c,d);await new Promise(r=>setImmediate(r));assert.equal(calls.length,4);assert.deepEqual(calls,[['one','account'],['two','account'],['a:b','c'],['a','b:c']]);releases.forEach(r=>r(7));await Promise.all([a,b,c,d]);const next=get('one','account');await new Promise(r=>setImmediate(r));assert.equal(calls.length,5);releases.at(-1)(8);assert.equal(await next,8);
let count=0;const retry=createBalanceClient(()=>{if(++count===1)throw Error('sync');return 0;});let p;assert.doesNotThrow(()=>p=retry('x','y'));assert.ok(p instanceof Promise);await assert.rejects(p,/sync/);assert.equal(await retry('x','y'),0);
let reject,n=0;const failing=createBalanceClient(()=>{n++;return new Promise((_,r)=>reject=r);});const x=failing('x','y'),y=failing('x','y');assert.strictEqual(x,y);await new Promise(r=>setImmediate(r));reject(Error('async'));assert.deepEqual((await Promise.allSettled([x,y])).map(r=>r.status),['rejected','rejected']);const z=failing('x','y');await new Promise(r=>setImmediate(r));assert.equal(n,2);reject(Error('again'));await assert.rejects(z);
for(const balanceMinor of [0,-250,125]){const r=await resolveBalance(createBalanceClient(()=>({balanceMinor,currency:'JPY'})),'t','a');assert.deepEqual(r,{tenant:'t',account:'a',balanceMinor,currency:'JPY'});}
await new Promise(r=>setTimeout(r,25));assert.deepEqual(unhandled,[]);console.log('independent contract oracle passed');`;

export async function validate(task,cwd){
 if(task.id==='incident')return validatePrevious(task,cwd);
 const checks=[],add=(name,pass,detail)=>checks.push({name,pass,...(detail?{detail}:{})});
 const protectedFiles=task.id==='cross_file'?['SPEC.md','smoke.mjs']:Object.keys(task.files);
 for(const name of protectedFiles){try{add('unchanged:'+name,await readFile(`${cwd}/${name}`,'utf8')===task.files[name]);}catch{add('unchanged:'+name,false);}}
 if(task.id==='cross_file'){
  const p=spawnSync(process.execPath,['--input-type=module'],{cwd,input:hidden,encoding:'utf8',timeout:10000});add('independent_contract_oracle',p.status===0,(p.stdout+p.stderr).slice(0,5000));
  try{add('diagnosis_present',(await readFile(`${cwd}/diagnosis.md`,'utf8')).length>150);}catch{add('diagnosis_present',false);}
 }else{
  try{const r=JSON.parse(await readFile(`${cwd}/findings.data`,'utf8'));
   for(const [k,v]of Object.entries({driver:'credit-v2',header:'x-replay-key',scope:'tenant',durable:true,windowSeconds:900,expiryRisk:'possible',observedIncidence:'unknown'}))add(k,r[k]===v);
   const chain=['packages/http/credits.mjs','packages/accounting/credit.mjs','packages/settlement/replay.mjs','packages/settlement/log.mjs'];add('callChain',JSON.stringify(r.callChain)===JSON.stringify(chain));
   const required=[...chain,'config/production.mjs','docs/adr/017-refund-replays.md','docs/archive/refund-rollout.md','docs/ops/late-replay.md'];add('evidence_paths',Array.isArray(r.evidencePaths)&&required.every(x=>r.evidencePaths.includes(x))&&r.evidencePaths.every(x=>Object.hasOwn(task.files,x)));
   const report=await readFile(`${cwd}/investigation.md`,'utf8');add('report_citations',report.length>300&&required.every(x=>report.includes(x)));
  }catch(e){add('deliverable_read',false,e.code||e.name);}
 }
 return{pass:checks.every(c=>c.pass),checks};
}
