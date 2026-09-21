import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withLaunchAgent } from '../src/launch-agent.mjs';

for(const prior of [false,true]) test(`failed launch-agent bootstrap restores previous state (existing=${prior})`,()=>{
  const plist=join(mkdtempSync(join(tmpdir(),'jev-agent-')),'agent.plist');
  if(prior)writeFileSync(plist,'old job');
  const calls=[];let failed=false;
  const run=(cmd,args)=>{calls.push(args[0]);if(args[0]==='print'&&!prior)throw Error('not loaded');if(args[0]==='bootstrap'&&!failed){failed=true;throw Error('bootstrap failed');}};
  assert.throws(()=>withLaunchAgent({plist,launcher:'/new/path',domain:'fixture',run},()=>assert.fail('must not commit')),/bootstrap failed/);
  assert.equal(existsSync(plist),prior);if(prior)assert.equal(readFileSync(plist,'utf8'),'old job');
  assert.equal(calls.filter(x=>x==='bootstrap').length,prior?2:1);
});
test('failure after launch-agent bootstrap also restores the prior job',()=>{
  const plist=join(mkdtempSync(join(tmpdir(),'jev-agent-commit-')),'agent.plist');writeFileSync(plist,'old job');
  const calls=[];
  assert.throws(()=>withLaunchAgent({plist,launcher:'/new/path',domain:'fixture',run:(cmd,args)=>calls.push(args[0])},()=>{throw Error('commit failed');}),/commit failed/);
  assert.equal(readFileSync(plist,'utf8'),'old job');assert.equal(calls.filter(x=>x==='bootstrap').length,2);
});
