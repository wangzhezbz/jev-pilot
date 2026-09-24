import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkPrerequisites } from '../src/setup.mjs';
import { makeJudge } from '../runtime/desktop/router.mjs';
import {verifiedRuntime} from '../src/runtime-compatibility.mjs';
import {installationPlan} from '../src/installation.mjs';

test('installer accepts only exactly verified runtimes, including the desktop upgrade',()=>{
 const state={nodeSupported:true,curl:'curl',rg:'rg',realBin:'/fixture',credentialsConfigured:true};
  for(const version of ['codex-cli 0.155.0-alpha.9.2','codex-cli 0.155.0-alpha.16.3','codex-cli 0.155.0-alpha.16.4']){
  assert.equal(verifiedRuntime(version),true);assert.equal(installationPlan({...state,runtimeVersion:version}).canSetup,true);
 }
  for(const version of ['codex-cli 0.155.0-alpha.16.5','codex-cli 0.156.0','0.155.0-alpha.16.3',undefined]){
  assert.equal(verifiedRuntime(version),false);assert.equal(installationPlan({...state,runtimeVersion:version}).canSetup,false);
 }
});

test('preflight identifies each missing prerequisite',()=>{
  assert.throws(()=>checkPrerequisites({node:'22.0',command:()=>assert.fail('must reject Node first')}),/NODE_24_REQUIRED/);
  assert.throws(()=>checkPrerequisites({node:'24.0',command:()=>null}),/CURL_REQUIRED/);
  assert.throws(()=>checkPrerequisites({node:'24.0',command:name=>name==='rg'?null:'available'}),/RIPGREP_REQUIRED/);
  assert.doesNotThrow(()=>checkPrerequisites({node:'24.0',command:()=>'available'}));
});
test('existing routing judge adopts added and rotated credentials and stops using removed credentials',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'jev-key-refresh-')),'.env.local'),seen=[];
  const judge=await makeJudge(path,{env:{},send:async(payload,key)=>{seen.push({key,state:payload.state});return {answers:{},model:'fixture'};}});
  await assert.rejects(judge({}),/MISSING_KEY/);
  writeFileSync(path,'TYPESAFE_API_KEY=fixture-first\n',{mode:0o600});
  await judge({context:'fixture-first'});
  writeFileSync(path,'TYPESAFE_API_KEY=fixture-second\n',{mode:0o600});
  await judge({context:'fixture-second'});
  unlinkSync(path);
  await assert.rejects(judge({}),/MISSING_KEY/);
  assert.deepEqual(seen,[{key:'fixture-first',state:{context:'[REDACTED]'}},{key:'fixture-second',state:{context:'[REDACTED]'}}]);
});
test('explicit process credential takes precedence over private file',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'jev-key-env-')),'.env.local');writeFileSync(path,'TYPESAFE_API_KEY=file-fixture\n',{mode:0o600});
  const judge=await makeJudge(path,{env:{TYPESAFE_API_KEY:'environment-fixture'},send:async(payload,key)=>{assert.equal(key,'environment-fixture');return {answers:{}};}});
  await judge({});
});
