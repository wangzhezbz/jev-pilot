import { Store, Judge, loadConfig, hash, now, redact } from './core.mjs';
import {checkpointObserver,checkpointRelevant,checkpointForTurn,resumeContext} from './checkpoints.mjs';
import {outputAdapter} from './output-adapters.mjs';
import { filterOutput } from './evidence.mjs';
import {EVIDENCE_POLICY} from './policy.mjs';
import {nestedNativeOutput,exactEvidenceRequest} from './prepare-output.mjs';
// Runs inside the existing desktop bridge, before releasing a supported tool boundary.
// Only text responses are eligible. Structured outputs retain their contract unchanged.
export function createAutomation({ store = new Store(), key, send, clock=Date.now, batchConcurrency=2 } = {}) {
  const observe=checkpointObserver(store),active=new Set(),blocked=new Set();let closed=false;
  const cancel=threadId=>{blocked.add(threadId);for(const job of active)if(job.threadId===threadId)job.controller.abort();};
  return {
    store,
    cancel,
    observe, checkpointRelevant, flush:observe.flush,
    resumeContext:(root,threadId,task)=>resumeContext(store,root,threadId,task),
    enabled(root) { try { return loadConfig(store, store.project(root)).enabled === true; } catch { return false; } },
    async hook(payload) {
      if (closed || !payload.cwd || !payload.session_id) return {};
      const project = store.project(payload.cwd), config = loadConfig(store, project);
      if (!config.enabled) return {};
      const id = hash(payload.session_id), state = store.get(project, 'automatic_task', id) || { count: 0, goal: '', recent: [] };
      if (payload.hook_event_name === 'UserPromptSubmit') {
        cancel(payload.session_id);blocked.delete(payload.session_id);
        state.goal = redact(String(payload.prompt || '')).slice(0, 10000); state.count = 0; state.recent = [];state.filteredSources=[];state.turnId=payload.turn_id;
        store.put(project, 'automatic_task', state, id); return {};
      }
      if (payload.hook_event_name !== 'PostToolUse' || !state.goal) return {};
      if(blocked.has(payload.session_id) || (state.turnId && state.turnId!==payload.turn_id))return {};
      const fingerprint = hash({ thread:payload.session_id, turn: payload.turn_id, call: payload.tool_use_id });
      if (state.recent.includes(fingerprint)) return {};
      state.recent = [...state.recent.slice(-99), fingerprint];
      const adapter=outputAdapter(payload.tool_name,payload.tool_response),response=adapter?.text;
      const checkpoint=checkpointForTurn(store.get(project,'checkpoint','auto-'+id),{task:state.goal,threadId:payload.session_id,turnId:payload.turn_id});
      store.put(project,'checkpoint',{...checkpoint,task:state.goal,updatedAt:now(),lastTool:payload.tool_name},'auto-'+id);
      // Admission gate avoids API overhead on small, exact-output and structured results.
      let reason = nestedNativeOutput(payload)?'nested_native_result':!adapter ? 'structured'
        : response.length < 12000 ? 'small' : response.length > 100000 ? 'oversized'
        : state.count >= 2 ? 'turn_limit'
        : exactEvidenceRequest(state.goal) ? 'exact_output'
        : /jev_pilot|jev_evidence|code_mode|functions\.exec/i.test(payload.tool_name || '') ? 'nested_or_self' : 'eligible';
      let cooldownId;
      if(reason==='eligible'){
        cooldownId=hash({session:payload.session_id,goal:state.goal,tool:payload.tool_name,model:config.model,policy:EVIDENCE_POLICY,mode:config.evidenceMode,threshold:config.excludeProbability,sourceHash:hash(response)});
        const cooldown=store.get(project,'automatic_filter_cooldown',cooldownId);
        if(state.filteredSources?.includes(cooldownId))reason='repeat_read_full_evidence';
        if(reason==='eligible'&&cooldown?.until>clock()&&cooldown.until-clock()<=60000)reason='no_benefit_cooldown';
      }
      const eligible = reason === 'eligible';
      store.event(project, 'automatic_output_admission', { reason, adapter:adapter?.kind??null, boundaryId: fingerprint });
      if (!eligible) { store.put(project, 'automatic_task', state, id); return {}; }
      state.count++; store.put(project, 'automatic_task', state, id);
      const controller=new AbortController();let release;const settled=new Promise(resolve=>release=resolve),job={threadId:payload.session_id,controller,settled};active.add(job);
      const judge = new Judge({ store, project, taskId: payload.session_id, signal:controller.signal, concurrency:batchConcurrency, config: { ...config, maxCalls: Math.min(6,config.maxCalls), timeoutMs: Math.min(1800,config.timeoutMs) }, ...(key !== undefined ? { key } : {}), ...(send ? { send } : {}) });
      const started=performance.now(),originalBytes=Buffer.byteLength(typeof payload.tool_response==='string'?payload.tool_response:JSON.stringify(payload.tool_response)),sourceTextBytes=Buffer.byteLength(response);
      let result;
      try {result=await filterOutput({store,project,config,judge,root:payload.cwd},{goal:state.goal,text:response,source:payload.tool_name,budget:500000,requireCompleteJudgment:true});}
      catch(error){store.event(project,'automatic_output_result',{boundaryId:fingerprint,applied:false,reason:'filter_error',code:/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'UNAVAILABLE',elapsedMs:Math.round(performance.now()-started)});return {};}
      finally{active.delete(job);release();}
      const feedback=adapter.wrap(`JevPilot retained task evidence from ${payload.tool_name}. The original output is saved locally. This is partial evidence; use jev_pilot recall for omitted material. Artifact: ${result.artifactId}\n${result.context}`);
      const retainedBytes=Buffer.byteLength(feedback),retainedRatio=retainedBytes/Math.max(1,originalBytes);
      const current=store.get(project,'automatic_task',id);
      const outcome=current?.turnId!==payload.turn_id||current?.goal!==state.goal ? 'stale_turn'
        : controller.signal.aborted ? 'cancelled'
        : result.degraded ? 'degraded' : !result.items.length ? 'empty_selection'
        : result.deferredIds.length ? 'incomplete_coverage'
        : retainedRatio>=.8 || !(result.excludedIds.length || result.duplicateIds.length) ? 'insufficient_reduction' : 'applied';
      store.event(project,'automatic_output_result',{boundaryId:fingerprint,submitted:outcome==='applied',applied:false,modelReceipt:'unconfirmed',reason:outcome==='applied'?'submitted':outcome,originalBytes,sourceTextBytes,retainedBytes,retainedRatio,artifactId:result.artifactId,excludedItems:result.excludedIds.length,deferredItems:result.deferredIds.length,duplicateItems:result.duplicateIds.length,completeCoverage:result.completeCoverage,elapsedMs:Math.round(performance.now()-started),nativeTokenSavings:null});
      if(['insufficient_reduction','empty_selection'].includes(outcome))
        store.put(project,'automatic_filter_cooldown',{until:clock()+60000,reason:outcome},cooldownId);
      if(outcome!=='applied')return {};
      current.filteredSources=[...(current.filteredSources||[]),cooldownId].slice(-2);
      store.put(project,'automatic_task',current,id);
      store.put(project,'automatic_filter_cooldown',{until:0,reason:'applied'},cooldownId);
      store.event(project,'automatic_output_filter',{boundaryId:fingerprint,submissionOnly:true,modelReceipt:'unconfirmed',originalBytes,sourceTextBytes,retainedBytes,artifactId:result.artifactId,nativeTokenSavings:null});
      return { continue: false, stopReason: feedback };
    },
    async close() { closed=true;for(const job of active)job.controller.abort();await Promise.allSettled([...active].map(job=>job.settled));await observe.flush();store.close(); },
  };
}
