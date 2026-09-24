import test from 'node:test';
import assert from 'node:assert/strict';
import {Router,SUPPORTED_MODELS,effortQuestion} from '../runtime/desktop/router.mjs';

test('automatic effort selection preserves all six user-selected models, including a foreign model field from the evaluator',async()=>{
  for(const model of SUPPORTED_MODELS){
    const requests=[];
    const router=new Router({coalesceMs:0,judge:async()=>({model:'untrusted-other-model',targetModel:'gpt-6-luna',answer:{type:'choice',choice:'low',confidence:1,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k==='low'?1:0]))}}),request:async(method,params)=>{requests.push({method,params});return{status:'applied'};}});
    router.supported.set(model,['low','medium','high']);
    router.start('thread',{model,effort:'high',input:[{type:'text',text:'Report already verified results.'}]});
    router.observe({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
    await router.hook({session_id:'thread',turn_id:'turn',model,hook_event_name:'PostToolUse',tool_name:'exec_command',tool_use_id:'one',tool_response:'verification passed'});
    assert.equal(requests.length,1,model);
    assert.deepEqual(requests[0],{method:'turn/settings/update',params:{threadId:'thread',turnId:'turn',effort:'low'}});
    assert.equal(router.turns.get('thread').model,model);
    await router.restoreBaseline(router.turns.get('thread'),'fixture_new_input');
    assert.equal(router.turns.get('thread').model,model);
    assert.ok(requests.every(x=>!Object.hasOwn(x.params,'model')));
  }
});
