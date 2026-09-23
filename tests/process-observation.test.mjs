import test from 'node:test';import assert from 'node:assert/strict';import {bridgeIdentity,processTable}from'../src/process-observation.mjs';
test('PID reuse is rejected even when both old numbers are alive',()=>{
 const e={pid:1,backendPid:2,at:'2026-09-23T10:00:00Z'};assert.equal(bridgeIdentity(e,new Map([[1,{}],[2,{parentPid:9}]])),'pid_reused');
 assert.equal(bridgeIdentity(e,new Map([[1,{startedAt:Date.parse('2026-09-23T11:00:00Z')}],[2,{parentPid:1,startedAt:Date.parse('2026-09-23T11:00:00Z')}]])),'pid_reused');
 assert.equal(bridgeIdentity(e,new Map()),'unverified');
 assert.equal(bridgeIdentity(e,new Map([[1,{startedAt:Date.parse(e.at)}],[2,{parentPid:1,startedAt:Date.parse(e.at)}]])),'verified');
});
test('process table handles Unix and Windows formats without consuming command arguments',()=>{
 const unix=processTable([1,2],{platform:'darwin',exec:()=> '  1  9 Wed Sep 23 10:00:00 2026\n  2  1 Wed Sep 23 10:00:01 2026\n'});assert.equal(unix.get(2).parentPid,1);assert.equal(unix.get(1).startedAt,Date.parse('2026-09-23T10:00:00Z'));
 const win=processTable([2],{platform:'win32',exec:()=>JSON.stringify({pid:2,parentPid:1,startedAt:'2026-09-23T10:00:00Z'})});assert.equal(win.get(2).parentPid,1);assert.equal(processTable([2],{exec:()=>{throw Error('denied');}}).size,0);
});
