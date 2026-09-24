import { Store, loadConfig, requireValue } from './core.mjs';
import { RequestGuard } from './request-guard.mjs';
import { createSession, defineTask, summarizeHostResult } from './host-browser-session.mjs';
import { hostTransport } from './host-browser-transport.mjs';
export { createChromeDriver, createComputerUseDriver } from './host-browser-drivers.mjs';

// Bind once per authorized surface. Task definitions and full results stay in
// this object instead of requiring mutable cross-cell REPL variables.
export function createNavigator(options) {
  const { workspace, taskId, driver, maxSteps = 12 } = options;
  requireValue(typeof taskId === 'string' && /^[\w.:-]{1,128}$/.test(taskId), 'REAL_TASK_ID_REQUIRED');
  requireValue(driver && typeof driver.observe === 'function', 'INVALID_HOST_DRIVER');
  const ownsStore = !options.store, store = options.store || new Store();
  let project; try { project = store.project(workspace); } catch (error) { if (ownsStore) store.close(); throw error; }
  let session, task, full, busy = false, closed = false;
  const budget = () => {
    const config = loadConfig(store, project);
    return { config, available: new RequestGuard({ store, project, taskId, config }).capacity({ model: config.model }) };
  };
  const execute = async () => {
    full = await session.run(task);
    const receipt = summarizeHostResult(full);
    if (full.status === 'needs_verification') {
      // A separate official host read after the loop. Codex evaluates the actual
      // returned text before claiming completion; this is never automatic signoff.
      const start = performance.now();
      try {
        const observed = await driver.observe();
        full.finalObservation = { snapshot: observed.snapshot, observedAt: observed.observedAt };
        receipt.finalObservation = { ...full.finalObservation, snapshot: observed.snapshot.slice(0, 12000), truncated: observed.snapshot.length > 12000 };
        receipt.instruction = 'Codex must inspect this fresh finalObservation against the user request before claiming completion. If inadequate, observe natively again.';
      } catch {
        full.finalObservationError = receipt.finalObservationError = 'HOST_FINAL_OBSERVATION_FAILED';
        receipt.instruction = 'Final native observation failed. Codex must observe again before claiming completion; do not repeat completed actions.';
      } finally { full.finalObservationMs = receipt.finalObservationMs = performance.now() - start; }
    }
    return receipt;
  };
  return {
    get result() { return full; },
    capacity() { requireValue(!closed, 'HOST_SESSION_CLOSED'); return budget().available; },
    async run(spec) {
      requireValue(!closed && !busy, 'HOST_SESSION_BUSY');
      const expectedSteps = spec.expectedSteps ?? 2;
      requireValue(Number.isInteger(expectedSteps) && expectedSteps >= 1 && expectedSteps <= maxSteps, 'INVALID_HOST_EXPECTED_STEPS');
      // Validate before replacing any previous resumable task.
      const nextTask = defineTask({ ...spec, stages: spec.stages || [{ goal: spec.goal }] });
      nextTask.signal = spec.signal;
      busy = true;
      try {
        session?.close(); session = null; task = nextTask; full = null;
        const { config, available } = budget();
        const minWait = options.send && options.send !== hostTransport ? 100 : 1000;
        const timings = store.events(project, 120).filter(e => e.kind === 'jev_call' && e.purpose === 'browser' &&
          e.status === 'success' && e.model === config.model && Number.isFinite(e.elapsedMs) && e.elapsedMs > 0 &&
          Date.now() - Date.parse(e.at) >= 0 && Date.now() - Date.parse(e.at) < 3600000).slice(0, 20).map(e => e.elapsedMs).sort((a, b) => a - b);
        const stepMs = timings.length >= 3 ? Math.max(100, timings[Math.ceil(timings.length * .75) - 1] * 1.5) : minWait;
        // A percentile estimate plus the final request's minimum allowance,
        // not a promise that all steps will finish within the remaining quota.
        const admission = { expectedSteps, samples: timings.length, estimatedStepMs: stepMs, requiredWaitMs: minWait + (expectedSteps - 1) * stepMs };
        const reason = !config.enabled ? 'DISABLED' : expectedSteps === 1 ? 'HOST_NATIVE_SINGLE_ACTION' :
          available.cooldown ? 'JEV_COOLDOWN' : available.calls < expectedSteps || available.waitMs < admission.requiredWaitMs || available.bytes === 0 ? 'HOST_INSUFFICIENT_TASK_BUDGET' : null;
        if (reason) {
          full = { status: 'codex_review_required', reason, budget: available, admission,
            metrics: { runs: 0, actions: 0, jevRequests: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0, apiMs: 0, elapsedMs: 0, handoffs: 0 },
            instruction: 'Continue natively. No browser action or paid request was made. Do not change task identity or budget to retry.' };
          store.event(project, 'browser_host_admission', { reason, ...admission, ...available });
          return full;
        }
        session = createSession({ ...options, store });
        const receipt = await execute();
        full.admission = receipt.admission = admission;
        return receipt;
      } finally { busy = false; }
    },
    async resume() {
      requireValue(!closed && !busy, 'HOST_SESSION_BUSY');
      requireValue(session && task, 'HOST_NO_RESUMABLE_TASK');
      busy = true; try { return await execute(); } finally { busy = false; }
    },
    close() { requireValue(!busy, 'HOST_SESSION_BUSY'); if (closed) return; session?.close(); if (ownsStore) store.close(); closed = true; },
  };
}
