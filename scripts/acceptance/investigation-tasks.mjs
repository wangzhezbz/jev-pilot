// New synthetic tasks, frozen before the first model run. No live data or services.
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const filler=Array.from({length:12},(_,i)=>`Background note ${i+1}: Atlas operates several independent facilities. Examples describe only the component named in this note. Configuration names may recur across components; ownership and release status determine which contract applies. Do not infer delivery semantics from an administrative display.`).join('\n');
const notes=[
 ['N21','Atlas workspace notifications','The sidebar shows a webhook activity badge. Its refresh cadence is 30 seconds. This describes presentation and does not schedule outbound retries.'],
 ['N84','Atlas outbound webhook contract','Current production contract: retry transient delivery responses 429 and 503. There are four total delivery attempts, including the first attempt. Before each retry use 250 ms multiplied by 2 to the power of the retry index, starting at zero. An integer Retry-After header in seconds overrides the computed delay, capped at 30 seconds. A noninteger or absent header leaves the computed delay unchanged.'],
 ['N13','Atlas schema storage','Webhook configuration records are copied into an internal catalog. The catalog refreshes every 15 minutes. This storage cache is independent of outbound delivery attempts.'],
 ['N67','Atlas display accessibility','The webhook panel obeys reduced motion preferences. Screen reader names come from visible labels. This note concerns controls and has no transport contract.'],
 ['N32','Atlas billing export','Webhook subscriptions appear as export rows. Currency rounding happens at the invoice boundary and does not control delivery retry behavior.'],
 ['N90','Atlas ingest tutorial','This tutorial describes clients sending records into Atlas. Client retry examples are illustrative. Inbound ingest and outbound webhook delivery have independent contracts.'],
 ['N45','Atlas outbound webhook incident correction','Production erratum for the outbound webhook contract: status 500 is also retryable, in addition to the contract statuses. A response carrying X-Atlas-Delivery: permanent must never be retried, regardless of status. This overrides the general retry rule. The total-attempt limit and delay rules are unchanged.'],
 ['N76','Atlas report layout','The report lists webhook endpoints alphabetically. A delivery history table is sortable but does not alter delivery scheduling.'],
 ['N08','Atlas internal scheduler','Internal heartbeat tasks use their own fixed interval. A webhook reference in monitoring labels is not a delivery retry policy.'],
 ['N59','Atlas outbound webhook archived design','Archived, never released: an early proposal limited delivery to two attempts and retried any non-2xx response. This proposal is superseded by the production contract and incident correction. Do not use its values for current delivery.'],
 ['N26','Atlas endpoint editor','The webhook URL editor validates URL syntax before saving. It does not infer endpoint response classes or modify transport policy.'],
 ['N71','Atlas pagination guide','The webhook events list is paginated with an opaque cursor. Page size and refresh interval govern viewing history only.'],
];
const docsFiles=Object.fromEntries(notes.map(([id,title,body],i)=>[`notes/n${String(i).padStart(2,'0')}.md`,`# ${id} ${title}\n${filler}\n${body}\n`]));
const source=`export async function pollOnce({store, transport, apply}) {
  const cursor = await store.get('cursor');
  const page = await transport.fetch(cursor);
  await store.set('cursor', page.next);
  for (const event of page.events) await apply(event);
  return page.events.length;
}\n`;
export const investigationTasks=[{
 id:'policy',files:docsFiles,
 prompt:'Inspect notes/ and reconcile the current Atlas outbound webhook retry policy, including its production correction and superseded design. Write answer.json with retryableStatuses (sorted integers), maximumTotalAttempts, delayBaseMs, delayMultiplier, retryAfterCapSeconds, permanentHeaderValue, archivedMaximumAttempts and sourceIds (only the production contract, production correction and archived design IDs). Write answer.md explaining precedence and the Retry-After fallback, citing source IDs. Do not modify the source notes. Use current evidence rather than guessing from other Atlas components.'
},{id:'cursor',files:{'src/poller.mjs':source,'SPEC.md':'pollOnce must fetch using the stored cursor, apply page events sequentially in order, and save page.next only after every apply resolves. If fetch or apply rejects, propagate that rejection and keep the prior cursor. An empty page still advances the cursor. Propagate a save rejection. Return the event count. Preserve the public export and caller interfaces.\n'},
 prompt:'Fix src/poller.mjs according to SPEC.md. Add regression.test.mjs using node:test, run it, and write diagnosis.md explaining the bug and validation. Preserve SPEC.md and the public interface. Use fake dependencies; do not contact services.'}];
export async function validateInvestigation(task,cwd){
 const checks=[];for(const [path,original]of Object.entries(task.files))if(task.id==='policy'||path==='SPEC.md')checks.push([path+' unchanged',await readFile(join(cwd,path),'utf8').catch(()=>null)===original]);
 if(task.id==='policy'){
  let a;try{a=JSON.parse(await readFile(join(cwd,'answer.json'),'utf8'));}catch{}
  const expected={retryableStatuses:[429,500,503],maximumTotalAttempts:4,delayBaseMs:250,delayMultiplier:2,retryAfterCapSeconds:30,permanentHeaderValue:'permanent',archivedMaximumAttempts:2};
  for(const [k,v]of Object.entries(expected))checks.push([k,JSON.stringify(a?.[k])===JSON.stringify(v)]);
  checks.push(['sourceIds',JSON.stringify(a?.sourceIds?.slice().sort())===JSON.stringify(['N45','N59','N84'])]);
  const body=await readFile(join(cwd,'answer.md'),'utf8').catch(()=>'');checks.push(['citations',body.length>100&&['N45','N59','N84'].every(id=>body.includes(id))]);
 }else{
  const original=task.files['src/poller.mjs'],updated=await readFile(join(cwd,'src/poller.mjs'),'utf8').catch(()=>''),tests=await readFile(join(cwd,'regression.test.mjs'),'utf8').catch(()=>'');
  checks.push(['patch exists',updated.length>0&&updated!==original]);checks.push(['tests exist',tests.includes('node:test')]);
  const run=async code=>{const dir=await mkdtemp(join(tmpdir(),'jev-cursor-oracle-'));await writeFile(join(dir,'poller.mjs'),code);await writeFile(join(dir,'verify.mjs'),`import assert from 'node:assert/strict';import {pollOnce} from './poller.mjs';
for(const scenario of ['success','apply','fetch','empty','save']){let cursor='old',order=[];const boom=new Error('oracle');const events=scenario==='empty'?[]:[1,2,3];const input={store:{get:async()=>cursor,set:async(k,v)=>{assert.deepEqual(order,events);if(scenario==='save')throw boom;cursor=v;}},transport:{fetch:async c=>{assert.equal(c,'old');if(scenario==='fetch')throw boom;return{events,next:'new'};}},apply:async e=>{await new Promise(r=>setTimeout(r,2));if(scenario==='apply'&&e===2)throw boom;order.push(e);}};if(['apply','fetch','save'].includes(scenario)){await assert.rejects(pollOnce(input),e=>e===boom);assert.equal(cursor,'old');}else{assert.equal(await pollOnce(input),events.length);assert.equal(cursor,'new');assert.deepEqual(order,events);}}
`);try{await exec(process.execPath,['verify.mjs'],{cwd:dir,timeout:10000});return true;}catch{return false;}};
  checks.push(['independent behavior oracle',await run(updated)]);
  try{await exec(process.execPath,['--test','regression.test.mjs'],{cwd,timeout:10000});checks.push(['submitted tests pass',true]);}catch{checks.push(['submitted tests pass',false]);}
  // Verify submitted tests can detect the original defect in the same fixture layout.
  const dir=await mkdtemp(join(tmpdir(),'jev-cursor-regression-'));
  const {mkdir}=await import('node:fs/promises');await mkdir(join(dir,'src'));await writeFile(join(dir,'src/poller.mjs'),original);await writeFile(join(dir,'regression.test.mjs'),tests);
  try{await exec(process.execPath,['--test','regression.test.mjs'],{cwd:dir,timeout:10000});checks.push(['submitted tests reject original',false]);}catch(e){checks.push(['submitted tests reject original',!e.killed&&Number.isInteger(e.code)&&e.code!==0&&!/ERR_MODULE_NOT_FOUND|SyntaxError/.test(e.stderr??'')]);}
  checks.push(['diagnosis', (await readFile(join(cwd,'diagnosis.md'),'utf8').catch(()=>'')).length>80]);
 }
 return{pass:checks.every(x=>x[1]),checks};
}
