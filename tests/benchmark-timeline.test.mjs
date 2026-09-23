import test from 'node:test';import assert from 'node:assert/strict';
import {timelineEntry} from '../scripts/acceptance/timeline.mjs';
test('timing evidence records boundaries without commands, prompts or remote error bodies',()=>{
  const secret='never-record-this';
  for(const method of ['item/started','item/completed','hook/started','hook/completed','error']){
    const r=timelineEntry({method,params:{item:{id:'one',type:'commandExecution',command:secret},error:{message:secret},text:secret}},12.34567);
    assert.equal(r.elapsedMs,12.346);assert(!JSON.stringify(r).includes(secret));
  }
  assert.equal(timelineEntry({method:'item/agentMessage/delta',params:{delta:secret}},1),null);
  assert.equal(timelineEntry({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{totalTokens:123}}}},8).totalTokens,123);
});
