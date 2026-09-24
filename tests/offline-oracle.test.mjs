import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {offlineTask,offlineExpected,validateOffline} from '../scripts/acceptance/offline-task.mjs';
test('semantic acceptance rejects a lost ambiguous record or extra included record',async()=>{
  const root=await mkdtemp(join(tmpdir(),'jev-offline-oracle-'));
  for(const [p,v]of Object.entries(offlineTask.files))await writeFile(join(root,p),v);
  const valid={include:[...offlineExpected.include],review:[...offlineExpected.review]};
  await writeFile(join(root,'findings.md'),[...valid.include,...valid.review].map(id=>`- ${id}: source-grounded fixture explanation for oracle validation.`).join('\n'));
  await writeFile(join(root,'findings.data'),JSON.stringify(valid));assert.equal((await validateOffline(offlineTask,root)).pass,true);
  await writeFile(join(root,'findings.data'),JSON.stringify({...valid,review:valid.review.slice(1)}));assert.equal((await validateOffline(offlineTask,root)).pass,false);
  await writeFile(join(root,'findings.data'),JSON.stringify({...valid,include:[...valid.include,'REQ-002']}));assert.equal((await validateOffline(offlineTask,root)).pass,false);
});
