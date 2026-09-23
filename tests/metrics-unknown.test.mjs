import test from 'node:test';
import assert from 'node:assert/strict';
import {metrics} from '../src/workflows.mjs';
test('failed and partially reported Jev calls are unknown usage, never known zero cost',()=>{
 const events=[{kind:'jev_call',status:'failed',inputTokens:null,outputTokens:null,elapsedMs:1800},
 {kind:'jev_call',status:'success',inputTokens:100,outputTokens:5,elapsedMs:200},
 {kind:'jev_call',status:'success',inputTokens:10,outputTokens:null,elapsedMs:100}];
 const result=metrics({project:'fixture',store:{events:()=>events}});
 assert.equal(result.jev.missingUsage,2);assert.equal(result.jev.failures,1);
 assert.equal(result.jev.inputTokens,110);assert.equal(result.jev.outputTokens,5);assert.equal(result.savings,null);
});
