import test from 'node:test';import assert from 'node:assert/strict';
import {gptRequestCost,jevRequestCost,taskCost} from '../src/cost.mjs';
test('cached input and reasoning output are not double billed; long context is per request',()=>{
 const u={inputTokens:10000,cachedInputTokens:8000,outputTokens:1000,reasoningOutputTokens:700};
 assert.equal(gptRequestCost('gpt-6-astra',u).usd,.078);assert.equal(gptRequestCost('gpt-6-astra',u,{tier:'fast'}).usd,.156);
 assert.equal(gptRequestCost('gpt-6-astra',{...u,inputTokens:272001}).longContext,true);
 assert.equal(gptRequestCost('gpt-6-astra',{...u,inputTokens:272000}).longContext,false);
 assert.equal(gptRequestCost('gpt-6-astra',{...u,cacheWriteInputTokens:1000}).usd,.0805);
});
test('Jev extra tokens may lower combined cost, while missing usage is never free',()=>{
 assert.equal(jevRequestCost('jev-1.13.0',100000).usd,.0042);
 assert.equal(jevRequestCost('jev-1.13.0',null).usd,null);assert.equal(gptRequestCost('unknown',{}).usd,null);
 const last={inputTokens:100,cachedInputTokens:0,outputTokens:10},total={totalTokens:110};
 const r=taskCost({model:'gpt-6-astra',usage:[{last,total},{last,total}],jevCalls:[{model:'jev-1.13.0',inputTokens:10000},{status:'failed'}]});
 assert.equal(r.generations,1);assert.equal(r.complete,false);assert.equal(r.unknownCalls,1);assert.equal(r.jevKnownUsd,.00042);
 assert.equal(gptRequestCost('gpt-6-astra',{...last,cachedInputTokens:101}).usd,null);
});
