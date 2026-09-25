// Frozen, previously unused synthetic tasks. Oracle code is never placed in model workspaces.
import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';
const stableSort={id:'holdout_sort',category:'code',files:{
 'SPEC.md':'Implement rankTickets(items) in rank.mjs. Return a new array, never mutate input objects or array. Sort open before closed, then priority critical/high/normal/low (unknown last), then valid finite numeric due ascending (invalid and missing last). Break all ties by original order. closed means status exactly closed; all other statuses count as open. Empty input returns empty. Do not coerce strings to numeric due dates.',
 'rank.mjs':`export function rankTickets(items){return items.sort((a,b)=>(a.due||Infinity)-(b.due||Infinity));}\n`
},prompt:'Fix rankTickets according to SPEC.md, including invalid values and stability. Add meaningful local tests and run them. Do not add dependencies or modify SPEC.md.'};
const ranges={id:'holdout_ranges',category:'code',files:{
 'SPEC.md':'Implement subtractIntervals(base, removed) in ranges.mjs. Inputs are arrays of half-open integer intervals [start,end]. Ignore zero-length intervals. Reject non-finite, non-integer endpoints and inverted intervals with RangeError. Normalize both sets by union (overlap and touching), then subtract the removed union from the base union. Return sorted nonempty disjoint half-open intervals; do not mutate input. Negative endpoints and empty arrays are valid.',
 'ranges.mjs':`export function subtractIntervals(base,removed){return base.filter(x=>!removed.some(y=>y[0]<=x[0]&&y[1]>=x[1]));}\n`
},prompt:'Repair subtractIntervals to satisfy SPEC.md. Cover overlaps, boundaries, normalization and validation with local tests. No dependencies; preserve SPEC.md.'};
const repeated='This entry is a historical service record. Read its scope, decision and current status together. A matching product name alone does not establish eligibility. ';
const records=[];const wanted=[9,41,73];
for(let i=0;i<90;i++){
 const id='CASE-'+String(i).padStart(3,'0');let text;
 if(wanted.includes(i))text='Tenant requested erasure of all personal profile fields. The request has been authenticated. Retention obligations have expired and there is no active dispute. The deletion has not yet been executed.';
 else text=[
 'Tenant requested account closure only. They explicitly asked to preserve personal profile records for later reactivation.',
 'Authenticated erasure request exists, but an active legal hold requires preserving the personal profile fields.',
 'The erasure request is authenticated and eligible. Execution completed yesterday; no remaining personal profile fields are held.',
 'A request for complete profile erasure arrived but authentication has not completed. Eligibility remains unresolved.',
 'Customer requested removing a marketing subscription, while their account and profile must remain active.'
 ][i%5];records.push(`## ${id}\n${repeated}${text}\n`);
}
const eligibility={id:'holdout_eligibility',category:'documents',files:{'requests.md':records.join('\n')},prompt:'Review requests.md. Identify only authenticated, not-yet-executed requests to erase all personal profile fields where retention obligations have expired and no active dispute or legal hold prevents execution. Do not treat account closure or marketing opt-out as full erasure. Write findings.data as {eligibleIds:[source IDs sorted]} and findings.md explaining exclusions and citing source IDs. Do not change source documents.'};
const releaseFiles={'README.md':'Evaluate the Larch rollout from the current signed policy and latest service decisions. Historical notes and proposals are not authority. No production measurements are supplied.\n'};
for(let i=0;i<70;i++)releaseFiles[`docs/note-${String(i).padStart(3,'0')}.md`]=`# Archive ${i}\n${repeated.repeat(4)}Historic rollout notes for project ${i%2?'Cedar':'Larch'} used a five percent canary and manual fallback. This is not a current signed policy. No production measurements supplied.\n`;
releaseFiles['docs/current-policy.md']='# Signed policy 2026-09-20\nLarch production rollout is limited to ten percent traffic in eu-west. Observe for 45 minutes. Error rate strictly greater than 2 percent for two consecutive windows requires rollback. Exactly 2 percent does not trigger rollback. The delegated reviewer is Mira. This supersedes the archive proposal.\n';
releaseFiles['docs/decision-20260922.md']='# Signed amendment 2026-09-22\nFor Larch only, change the observation duration to 90 minutes and delegated reviewer to Ivo. Other signed policy conditions remain unchanged.\n';
releaseFiles['docs/proposal-20260924.md']='# Unapproved proposal 2026-09-24\nSuggest lifting Larch traffic to 40 percent and changing its reviewer to Noel. This is not signed or approved.\n';
const policy={id:'holdout_policy',category:'documents',files:releaseFiles,prompt:'Find the currently authorized Larch production rollout conditions in this repository. Resolve signed amendments against historical notes and unapproved proposals. Write findings.data as {trafficPercent,region,observationMinutes,errorThresholdPercent,thresholdComparison,consecutiveWindows,reviewer,observedProductionOutcome,evidencePaths}. thresholdComparison is greater or greater_or_equal. Do not infer actual production success without measurements. Also write a short findings.md with citations. Preserve existing files.'};
export const holdoutTasks=[stableSort,ranges,eligibility,policy];
const sortOracle=`import assert from 'node:assert/strict';import {rankTickets} from './rank.mjs';
const x=[{id:0,status:'closed',priority:'critical',due:1},{id:1,priority:'high',due:0},{id:2,priority:'critical',due:NaN},{id:3,priority:'critical',due:-1},{id:4,priority:'high',due:'-99'},{id:5,priority:'high',due:0},{id:6,priority:'unknown',due:-9}];const before=structuredClone(x);x.forEach(Object.freeze);Object.freeze(x);const y=rankTickets(x);assert.deepEqual(y.map(x=>x.id),[3,2,1,5,4,6,0]);assert.notStrictEqual(x,y);assert.deepEqual(x,before);assert.deepEqual(rankTickets([]),[]);console.log('oracle passed');`;
const rangeOracle=`import assert from 'node:assert/strict';import {subtractIntervals as f} from './ranges.mjs';
const b=[[-5,5],[5,9],[20,25],[2,4]],r=[[-2,2],[3,7],[24,30]];const old=JSON.stringify([b,r]);assert.deepEqual(f(b,r),[[-5,-2],[2,3],[7,9],[20,24]]);assert.equal(JSON.stringify([b,r]),old);assert.deepEqual(f([[0,3]],[[3,5]]),[[0,3]]);assert.deepEqual(f([[0,0]],[]),[]);assert.deepEqual(f([],[[1,2]]),[]);for(const v of [[[3,1]],[[0,Infinity]],[[0,1.2]],[[0,'2']]])assert.throws(()=>f(v,[]),RangeError);
for(let n=0;n<60;n++){const a=[[n%7-5,n%7+2],[n%3,n%3+8]],z=[[-3,n%4],[n%5+1,n%5+3]];const expected=new Set();for(let i=-10;i<20;i++)if(a.some(([l,h])=>l<=i&&i<h)&&!z.some(([l,h])=>l<=i&&i<h))expected.add(i);const out=f(a,z),seen=new Set();for(let j=0;j<out.length;j++){const [l,h]=out[j];assert(l<h);if(j)assert(out[j-1][1]<l);for(let i=l;i<h;i++)seen.add(i);}assert.deepEqual(seen,expected);}console.log('oracle passed');`;
export async function validateHoldout(task,cwd){
 const checks=[];const add=(name,pass)=>checks.push({name,pass:Boolean(pass)});
 for(const [name,original] of Object.entries(task.files))if(!['rank.mjs','ranges.mjs'].includes(name))add('protected:'+name,await readFile(cwd+'/'+name,'utf8').then(s=>s===original).catch(()=>false));
 if(task.category==='code'){const r=spawnSync(process.execPath,['--input-type=module','-e',task.id==='holdout_sort'?sortOracle:rangeOracle],{cwd,encoding:'utf8',timeout:15000});add('independent_oracle',r.status===0);return{pass:checks.every(x=>x.pass),checks,oracleOutput:(r.stdout+r.stderr).slice(-1800)};}
 let data;try{data=JSON.parse(await readFile(cwd+'/findings.data','utf8'));}catch{}add('parse',Boolean(data));
 if(task.id==='holdout_eligibility')add('exact_eligible_ids',JSON.stringify(data?.eligibleIds)===JSON.stringify(wanted.map(i=>'CASE-'+String(i).padStart(3,'0'))));
 else{const expected={trafficPercent:10,region:'eu-west',observationMinutes:90,errorThresholdPercent:2,thresholdComparison:'greater',consecutiveWindows:2,reviewer:'Ivo',observedProductionOutcome:'unknown'};for(const [k,v] of Object.entries(expected))add(k,data?.[k]===v);add('evidence',Array.isArray(data?.evidencePaths)&&['docs/current-policy.md','docs/decision-20260922.md','docs/proposal-20260924.md'].every(x=>data.evidencePaths.includes(x))&&data.evidencePaths.every(x=>Object.hasOwn(task.files,x)));}
 const report=await readFile(cwd+'/findings.md','utf8').catch(()=>'');add('report',report.length>80);return{pass:checks.every(x=>x.pass),checks};
}
