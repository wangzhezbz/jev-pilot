// Local-only reproductions. Injected deterministic evaluator; no paid API calls.
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {Store,hash} from '../../src/core.mjs';import {Pilot} from '../../src/pilot.mjs';
import {Router,effortQuestion,horizonQuestion,routineProgress} from '../../runtime/desktop/router.mjs';
import {tasks} from './tasks.mjs';import {chunks} from '../../src/evidence.mjs';
import {protectedEvidence} from '../../src/policy.mjs';import {outputAdapter} from '../../src/output-adapters.mjs';
const choice=(q,c)=>({type:'choice',choice:c,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===c?1:0]))});
const root=mkdtempSync(join(tmpdir(),'jev-deep-audit-')),store=new Store({home:join(root,'private')});let calls=0;
const pilot=new Pilot({store,key:'fixture-only',send:async p=>{calls++;return{model:'fixture',usage:{input_tokens:0,output_tokens:0},answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>[id,choice(q,Object.keys(q.criteria)[0])]))};}});
const text=Array.from({length:120},(_,i)=>`sample ${i}: bounded record ${'a'.repeat(70)}`).join('\n');
const filtered=await pilot.call({workspace:root,operation:'filter_output',input:{goal:'Inspect all records',text,budget:500000}});
const rows=Array.from({length:12},(_,i)=>({id:'b'+i,role:'user',content:`constraint ${i} `+'b'.repeat(300)}));
const compact=await pilot.call({workspace:root,operation:'compact',input:{goal:'Preserve all constraints',blocks:rows}});
const bytes=x=>Buffer.byteLength(typeof x==='string'?x:JSON.stringify(x));
const wire={filter:{inputBytes:bytes(text),retainedContextBytes:bytes(filtered.context),resultJsonBytes:bytes(filtered),firstRecordOccurrences:JSON.stringify(filtered).split(text.split('\n')[0]).length-1},compact:{inputBytes:bytes(rows),reportedOutputBytes:compact.outputBytes,actualResultJsonBytes:bytes(compact),nativeHistoryChanged:compact.nativeHistoryChanged}};
const before=calls;
const quality=await pilot.call({workspace:root,operation:'quality',input:{content:'z'.repeat(31000),rules:[{id:'a',text:'No unsupported claim'},{id:'b',text:'Keep all numerical facts'}]}});
const largeQuality={calls:calls-before,verdict:quality.verdict,checks:quality.checks.map(x=>({source:x.source,reason:x.reason}))};
let routed=0;const router=new Router({coalesceMs:0,request:async()=>({status:'applied'}),judge:async()=>{routed++;return{answer:choice(effortQuestion,'medium'),horizon:choice(horizonQuestion,'10')};}});
router.supported.set('gpt-6-sol',['low','medium','high']);const params={threadId:'t',model:'gpt-6-sol',effort:'medium',input:[{type:'text',text:'Implement a bounded change'}]};
const turn=router.start('t',params);await router.routeStart(params);router.observe({method:'turn/started',params:{threadId:'t',turn:{id:'a'}}});
const prose=Array.from({length:5},(_,i)=>`Verification check ${i+1} passed; continuing the agreed verification plan.`);
for(let i=0;i<prose.length;i++){
 router.observe({method:'item/completed',params:{threadId:'t',turnId:'a',item:{type:'agentMessage',text:prose[i]}}});
 await router.hook({session_id:'t',turn_id:'a',hook_event_name:'PostToolUse',tool_use_id:String(i),tool_name:'shell',tool_response:'ok'});
}
const routing={requestedHorizon:10,calls:routed,actualChanges:turn.current==='medium'?0:null,ordinaryProgressClassifiedRoutine:prose.map(routineProgress),finalEffort:turn.current};
const log=tasks.find(t=>t.id==='incident').files['incident.log'];const groups=chunks({text:log,path:'incident.log',hash:hash(log)});
const chunking={total:groups.length,protected:groups.filter(x=>protectedEvidence(x)).length,mixedRelevantAndNoise:groups.filter(x=>/checkout|ledger_pool|settlement|H1/.test(x.text)&&x.text.includes('inventory-reporter')).length,pureBackground:groups.filter(x=>x.text.trim()&&x.text.split('\n').filter(Boolean).every(l=>l.includes('inventory-reporter'))).length};
const adapter={plainText:Boolean(outputAdapter('shell',text)),mcpText:Boolean(outputAdapter('mcp__browser__read',{content:[{type:'text',text}]})),mcpWithStructuredContent:Boolean(outputAdapter('mcp__browser__read',{content:[{type:'text',text}],structuredContent:{value:text}})),codeModeBypassPresent:/jev_pilot\|code_mode\|functions/.test(readFileSync('src/automation.mjs','utf8'))};
const after=process.argv.includes('--after');
if(after){const {modelResult}=await import('../../src/model-result.mjs');wire.filter.modelResultJsonBytes=bytes(modelResult('filter_output',filtered));wire.compact.modelResultJsonBytes=bytes(modelResult('compact',compact));}
const result={workingTreeAmended:after,at:new Date().toISOString(),sourceRevision:'84fcd49cfcffb6fa778c9864a381436e96a9ca3d',kind:'local_synthetic_reproductions',paidApiCalls:0,wire,largeQuality,routing,chunking,adapter};
writeFileSync(resolve('docs/reports/deep-audit-20260923/'+(after?'probes-after.json':'probes.json')),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));pilot.close();
