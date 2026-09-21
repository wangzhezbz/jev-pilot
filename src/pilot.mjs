import { realpathSync } from 'node:fs';
import { Store, Judge, loadConfig, requireValue } from './core.mjs';
import * as evidence from './evidence.mjs';
import * as workflow from './workflows.mjs';
import { browserStep, consumeBrowserTicket } from './browser.mjs';
import { desktopStatus, desktopMetrics } from './setup.mjs';

export const operations = {
  desktop_status: desktopStatus, desktop_metrics: desktopMetrics,
  decide: workflow.decide, select: evidence.selectEvidence, search: evidence.search,
  filter_output: evidence.filterOutput, recall: evidence.recall, select_tools: workflow.selectTools,
  recover: workflow.recoverFailure, quality: workflow.quality, run_checks: evidence.runChecks,
  verify_completion: evidence.verifyCompletion, browser_step: browserStep, browser_consume: consumeBrowserTicket,
  memory: workflow.memory, metrics: workflow.metrics, compact: evidence.compactContext,
  review: workflow.reviewChanges, checkpoint: workflow.checkpoint, extract: workflow.extract,
  status: ctx => ({ version: '0.2.0', configured: Boolean(ctx.judge.key), config: ctx.config, operations: Object.keys(operations), effortIntegration: 'Separate version-checked desktop bridge; use doctor for runtime status.' }),
  configure: (ctx, input) => {
    requireValue(input && typeof input === 'object');
    const allowed = ['enabled', 'memory', 'locale', 'maxCalls', 'timeoutMs', 'cacheMs'];
    requireValue(Object.keys(input).every(k => allowed.includes(k)), 'UNKNOWN_SETTING');
    for (const k of ['enabled', 'memory']) if (k in input) requireValue(typeof input[k] === 'boolean');
    if ('locale' in input) requireValue(['en', 'zh-CN', 'ru', 'ja', 'ko'].includes(input.locale));
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
    const judge = new Judge({ store: this.store, project, config, ...(this.key !== undefined ? { key: this.key } : {}), ...(this.send ? { send: this.send } : {}), signal });
    const ctx = { root, project, config, judge, store: this.store };
    const start = performance.now();
    const result = await operations[operation](ctx, input);
    this.store.event(project, 'operation', { operation, elapsedMs: Math.round(performance.now() - start), calls: judge.calls });
    return result;
  }
  close() { this.store.close(); }
}
