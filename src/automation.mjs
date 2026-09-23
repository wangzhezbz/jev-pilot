import { Store, Judge, loadConfig, hash, now, redact } from './core.mjs';
import {checkpointObserver} from './checkpoints.mjs';
import {outputAdapter} from './output-adapters.mjs';
import { filterOutput } from './evidence.mjs';
// Runs inside the existing desktop bridge, before releasing a supported tool boundary.
// Only text responses are eligible. Structured outputs retain their contract unchanged.
export function createAutomation({ store = new Store(), key, send } = {}) {
  return {
    store,
    observe:checkpointObserver(store),
    enabled(root) { try { return loadConfig(store, store.project(root)).enabled === true; } catch { return false; } },
    async hook(payload) {
      if (!payload.cwd || !payload.session_id) return {};
      const project = store.project(payload.cwd), config = loadConfig(store, project);
      if (!config.enabled) return {};
      const id = hash(payload.session_id), state = store.get(project, 'automatic_task', id) || { count: 0, goal: '', recent: [] };
      if (payload.hook_event_name === 'UserPromptSubmit') {
        state.goal = redact(String(payload.prompt || '')).slice(0, 10000); state.count = 0; state.recent = [];
        store.put(project, 'automatic_task', state, id); return {};
      }
      if (payload.hook_event_name !== 'PostToolUse' || !state.goal) return {};
      const fingerprint = hash({ turn: payload.turn_id, call: payload.tool_use_id });
      if (state.recent.includes(fingerprint)) return {};
      state.recent = [...state.recent.slice(-99), fingerprint];
      const adapter=outputAdapter(payload.tool_name,payload.tool_response),response=adapter?.text;
      store.put(project, 'checkpoint', { sourceHashes:{},completed:[],pending:['Reinspect state before continuing'],...(store.get(project,'checkpoint','auto-'+id)||{}),task: state.goal, requiresReview:true, createdAt: now(), receiptIds: [], lastTool: payload.tool_name, auto: true }, 'auto-' + id);
      // Admission gate avoids API overhead on small, exact-output and structured results.
      const reason = !adapter ? 'structured'
        : response.length < 12000 ? 'small' : response.length > 100000 ? 'oversized'
        : state.count >= 2 ? 'turn_limit'
        : /\b(json|csv|verbatim|exact output)\b|原样|完整输出|不.*删减/i.test(state.goal) ? 'exact_output'
        : /jev_pilot|code_mode|functions\.exec/i.test(payload.tool_name || '') ? 'nested_or_self' : 'eligible';
      const eligible = reason === 'eligible';
      store.event(project, 'automatic_output_admission', { reason, adapter:adapter?.kind??null, boundaryId: fingerprint });
      if (!eligible) { store.put(project, 'automatic_task', state, id); return {}; }
      state.count++; store.put(project, 'automatic_task', state, id);
      const judge = new Judge({ store, project, taskId: payload.session_id, config: { ...config, maxCalls: 2, timeoutMs: 1800 }, ...(key !== undefined ? { key } : {}), ...(send ? { send } : {}) });
      const result = await filterOutput({ store, project, config, judge, root: payload.cwd }, { goal: state.goal, text: response, source: payload.tool_name, budget: 10000 });
      if (result.degraded || result.context.length >= response.length * .8 || !result.items.length) return {};
      const feedback = adapter.wrap(`JevPilot retained task evidence from ${payload.tool_name}. The original output is saved locally. This is partial evidence; use jev_pilot recall for omitted material. Artifact: ${result.artifactId}\n${result.context}`);
      store.event(project, 'automatic_output_filter', { boundaryId: fingerprint, originalBytes: Buffer.byteLength(typeof payload.tool_response==='string'?payload.tool_response:JSON.stringify(payload.tool_response)),sourceTextBytes:Buffer.byteLength(response), retainedBytes: Buffer.byteLength(feedback), artifactId: result.artifactId, nativeTokenSavings: null });
      return { continue: false, stopReason: feedback };
    },
    close() { store.close(); },
  };
}
