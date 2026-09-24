// Benchmark transport for the production hint. MCP readiness is checked by the
// harness before turn/start; normal desktop checks it through the native bridge.
import {investigationHint} from '../../src/investigation-hint.mjs';
import {Store} from '../../src/core.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let result={};
try{
 const p=JSON.parse(raw);
 if(p.hook_event_name==='UserPromptSubmit'){
  const hint=await investigationHint(p.cwd,p.prompt);
  if(hint){
   const store=new Store();store.event(store.project(p.cwd),'investigation_hint',{submitted:true,eligibleFiles:hint.eligibleFiles,observedBytes:hint.observedBytes,modelReceipt:'unconfirmed'});store.close();
   result={hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:hint.context}};
  }
 }
}catch{}
process.stdout.write(JSON.stringify(result)+'\n');
