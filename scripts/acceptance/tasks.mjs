import {tasks as prior,validate as priorValidate} from '../benchmark/tasks.mjs';
import {readFile} from 'node:fs/promises';
// Generated operational fixture. Evidence is deliberately spread across distant
// chunks; a plausible earlier hypothesis is contradicted by later observations.
const lines=[];
for(let block=0;block<18;block++)for(let i=0;i<30;i++)lines.push(`L${String(lines.length+1).padStart(4,'0')} inventory-reporter routine sample zone=${block%3} batch=${i} queue=0 heartbeat=normal product=catalog trace=background-${block}-${i}`);
const facts={
  12:'deployment payments v2.8 activated at 10:04 UTC with ledger_pool_limit=4; previous version v2.7 used ledger_pool_limit=32',
  61:'checkout aggregate: 80 requests received between 10:05 and 10:08; 12 returned 503, 68 succeeded',
  126:'oncall hypothesis H1: DNS resolution might be responsible; NOT yet verified',
  213:'resolver audit: all 80 payments hostname resolutions succeeded, 0 DNS failures; H1 rejected by observation',
  304:'ledger trace: 12 rejected checkouts waited for a connection past 250 ms; all 12 returned 503; active connections pinned at 4',
  398:'mitigation: restored ledger_pool_limit=32 at 10:09 UTC without changing hostname, resolver or application version',
  487:'post-mitigation observation 10:10-10:15: 200 checkouts, 0 returned 503; latency p95 110 ms',
  531:'scope caveat: delayed settlement impact remains unknown; no settlement observation was collected'
};
for(const [i,v] of Object.entries(facts))lines[Number(i)]=`L${String(Number(i)+1).padStart(4,'0')} ${v}`;
const log=lines.join('\n')+'\n';
const incident={id:'incident',title:'Distributed evidence in a long operational log',files:{'incident.log':log},prompt:`Analyze incident.log and write incident.md explaining the checkout incident. First read this log through a shell command with an output limit sufficient for the entire file (at least 25000 output tokens); do not prefilter it yourself. Evidence is spread throughout the log. Identify the supported root cause, the rejected hypothesis and why it is rejected, the observed impact, mitigation and verification, and what remains unknown. Cite the original L-prefixed evidence IDs. Do not turn guesses into facts. Also write findings.data as a machine-readable object with these keys: rootCause (one of pool_limit_regression, dns_failure, unknown), failedRequests (integer), totalRequests (integer), failureRate (number 0..1), mitigationPoolLimit (integer), postMitigationFailures (integer), settlementImpact (one of unknown, confirmed_safe, confirmed_loss), rejectedHypothesis (one of dns_failure, pool_limit_regression, none), evidenceIds (all L-prefixed IDs supporting the report). Do not change incident.log. The requirement is substantive incident analysis; concise factual output is enough.`};
// Deliberately avoid an exact-output keyword in the user task: findings are a
// deliverable; the source log is eligible for normal output filtering.
export const tasks=[prior.find(t=>t.id==='bug_fix'),prior.find(t=>t.id==='mixed'),incident];
export async function validate(task,cwd){
 if(task.id!=='incident')return priorValidate(task,cwd);
 const checks=[];const add=(name,pass)=>checks.push({name,pass});
 try{
  add('unchanged:incident.log',await readFile(cwd+'/incident.log','utf8')===log);
  const r=JSON.parse(await readFile(cwd+'/findings.data','utf8'));
  const expected={rootCause:'pool_limit_regression',failedRequests:12,totalRequests:80,failureRate:.15,mitigationPoolLimit:32,postMitigationFailures:0,settlementImpact:'unknown',rejectedHypothesis:'dns_failure'};
  for(const [k,v] of Object.entries(expected))add(k,r[k]===v);
  const ids=Object.keys(facts).map(i=>'L'+String(Number(i)+1).padStart(4,'0'));
  add('evidence_coverage',Array.isArray(r.evidenceIds)&&ids.every(id=>r.evidenceIds.includes(id)));
  add('no_invented_ids',Array.isArray(r.evidenceIds)&&r.evidenceIds.every(id=>/^L\d{4}$/.test(id)&&Number(id.slice(1))<=lines.length&&Number(id.slice(1))>0));
  const report=await readFile(cwd+'/incident.md','utf8');add('written_report_with_citations',report.length>150&&ids.every(id=>report.includes(id)));
 }catch(e){checks.push({name:'deliverable_read',pass:false,error:e.code||e.name});}
 return{pass:checks.every(c=>c.pass),checks};
}
