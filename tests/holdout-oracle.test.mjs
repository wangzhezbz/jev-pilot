import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {holdoutTasks, validateHoldout} from '../scripts/acceptance/holdout-tasks.mjs';
async function fixture(task) {
  const dir = await mkdtemp(join(tmpdir(), 'jev-holdout-oracle-'));
  for (const [path, data] of Object.entries(task.files)) {
    await mkdir(dirname(join(dir, path)), {recursive:true});
    await writeFile(join(dir, path), data);
  }
  return dir;
}
for (const task of holdoutTasks.filter(t=>t.category==='code')) test(task.id+' rejects the original broken implementation', async()=>{
  const dir=await fixture(task), result=await validateHoldout(task,dir);
  assert.equal(result.pass,false);
  assert.equal(result.checks.find(c=>c.name==='independent_oracle').pass,false);
});
test('eligibility requires exact set and preserved evidence', async()=>{
  const task=holdoutTasks.find(t=>t.id==='holdout_eligibility'), dir=await fixture(task);
  await writeFile(join(dir,'findings.md'),'Eligible CASE-009, CASE-041, CASE-073. Other records are excluded for scope, authentication, legal hold, or completed erasure.');
  await writeFile(join(dir,'findings.data'),JSON.stringify({eligibleIds:['CASE-009','CASE-041','CASE-073']}));
  assert.equal((await validateHoldout(task,dir)).pass,true);
  await writeFile(join(dir,'findings.data'),JSON.stringify({eligibleIds:['CASE-009','CASE-041']}));
  assert.equal((await validateHoldout(task,dir)).pass,false);
  await writeFile(join(dir,'findings.data'),JSON.stringify({eligibleIds:['CASE-009','CASE-041','CASE-073']}));
  await writeFile(join(dir,'requests.md'),'modified evidence');
  assert.equal((await validateHoldout(task,dir)).pass,false);
});
test('policy rejects unsigned proposal and invented outcome',async()=>{
  const task=holdoutTasks.find(t=>t.id==='holdout_policy'),dir=await fixture(task);
  const data={trafficPercent:10,region:'eu-west',observationMinutes:90,errorThresholdPercent:2,thresholdComparison:'greater',consecutiveWindows:2,reviewer:'Ivo',observedProductionOutcome:'unknown',evidencePaths:['docs/current-policy.md','docs/decision-20260922.md','docs/proposal-20260924.md']};
  await writeFile(join(dir,'findings.md'),'Signed policy docs/current-policy.md plus docs/decision-20260922.md controls; docs/proposal-20260924.md is unapproved. No production outcome is observed.');
  await writeFile(join(dir,'findings.data'),JSON.stringify(data));
  assert.equal((await validateHoldout(task,dir)).pass,true);
  for(const change of [{trafficPercent:40},{observedProductionOutcome:'success'},{thresholdComparison:'greater_or_equal'},{evidencePaths:['missing.md']}]) {
    await writeFile(join(dir,'findings.data'),JSON.stringify({...data,...change}));
    assert.equal((await validateHoldout(task,dir)).pass,false);
  }
});
