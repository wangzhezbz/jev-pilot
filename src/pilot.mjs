import { realpathSync } from 'node:fs';
import { Store, Judge, loadConfig, requireValue } from './core.mjs';
import * as evidence from './evidence.mjs';
import * as workflow from './workflows.mjs';
import { browserStep, consumeBrowserTicket } from './browser.mjs';
import { desktopStatus, desktopMetrics } from './setup.mjs';
import { browserNetwork } from './browser-network.mjs';
import { evaluatePolicy } from './evaluation.mjs';
import {installationPlan,compatibilityProbe} from './installation.mjs';
import {activity} from './activity.mjs';
import { diagnostics } from './diagnostics.mjs';
import {prepareOutput,recallOutput} from './prepare-output.mjs';
import {investigate} from './investigate.mjs';

export const operations = {
  installation_plan:()=>installationPlan(),compatibility_probe:()=>compatibilityProbe(),activity, diagnostics, evaluate_policy: evaluatePolicy,
  desktop_status: desktopStatus, desktop_metrics: desktopMetrics,
  browser_network: (ctx, input) => browserNetwork({ repair: input.repair === true }),
  decide: workflow.decide, select: evidence.selectEvidence, search: evidence.search, investigate,
  filter_output: evidence.filterOutput, recall: evidence.recall, select_tools: workflow.selectTools,
  prepare_output: prepareOutput, recall_output: recallOutput,
  recover: workflow.recoverFailure, quality: workflow.quality, run_checks: evidence.runChecks,
  verify_completion: evidence.verifyCompletion, browser_step: browserStep, browser_consume: consumeBrowserTicket,
  memory: workflow.memory, metrics: workflow.metrics, compact: evidence.compactContext,
  review: workflow.reviewChanges, checkpoint: workflow.checkpoint, extract: workflow.extract,
  status: ctx => ({ version: '0.2.0', configured: Boolean(ctx.judge.key), config: ctx.config, operations: Object.keys(operations), effortIntegration: 'Separate version-checked desktop bridge; use doctor for runtime status.' }),
  configure: (ctx, input) => {
    requireValue(input && typeof input === 'object');
    const allowed = ['enabled', 'memory', 'locale', 'maxCalls', 'timeoutMs', 'cacheMs', 'evidenceMode', 'taskMaxCalls', 'taskMaxBytes', 'taskMaxWaitMs'];
    requireValue(Object.keys(input).every(k => allowed.includes(k)), 'UNKNOWN_SETTING');
    for (const k of ['enabled', 'memory']) if (k in input) requireValue(typeof input[k] === 'boolean');
    if ('locale' in input) requireValue(['en', 'zh-CN', 'ru', 'ja', 'ko'].includes(input.locale));
    if ('evidenceMode' in input) requireValue(['active', 'shadow'].includes(input.evidenceMode));
    for (const [k, low, high] of [['taskMaxCalls', 0, 200], ['taskMaxBytes', 0, 5000000], ['taskMaxWaitMs', 100, 120000]]) if (k in input) requireValue(Number.isInteger(input[k]) && input[k] >= low && input[k] <= high);
    for (const [k, low, high] of [['maxCalls', 0, 30], ['timeoutMs', 500, 10000], ['cacheMs', 0, 86400000]]) if (k in input) requireValue(Number.isInteger(input[k]) && input[k] >= low && input[k] <= high);
    const config = { ...ctx.config, ...input }; ctx.store.put(ctx.project, 'config', config, 'settings'); return { config };
  },
};
export class Pilot {
  constructor({ store = new Store(), key, send } = {}) { Object.assign(this, { store, key, send }); }
  async call({ workspace, operation, input = {} }, { signal } = {}) {
    requireValue(typeof workspace === 'string' && workspace.length > 0, 'WORKSPACE_REQUIRED');
    requireValue(Object.hasOwn(operations, operation), 'UNKNOWN_OPERATION');
    const root = realpathSync(workspace), project = this.store.project(root), config = loadConfig(this.store, project);
    const taskId = input.taskId ?? process.env.CODEX_THREAD_ID;
    if (taskId !== undefined) requireValue(typeof taskId === 'string' && /^[\w.:-]{1,128}$/.test(taskId), 'INVALID_TASK_ID');
    const judge = new Judge({ store: this.store, project, config, ...(this.key !== undefined ? { key: this.key } : {}), ...(this.send ? { send: this.send } : {}), signal, taskId,priority:operation==='recover'?'urgent':'routine' });
    const ctx = { root, project, taskId, config, judge, store: this.store };
    const start = performance.now();
    const result = await operations[operation](ctx, input);
    this.store.event(project, 'operation', { operation, elapsedMs: Math.round(performance.now() - start), calls: judge.calls });
    return result;
  }
  close() { this.store.close(); }
}
