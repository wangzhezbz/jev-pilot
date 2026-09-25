// Runs inside the official Chrome/Computer Use JS host. No second driver or server.
import { randomUUID } from 'node:crypto';
import { Store, Judge, loadConfig, requireValue, text } from './core.mjs';
import { hostTransport } from './host-browser-transport.mjs';
import { browserStep, consumeBrowserTicket } from './browser.mjs';
export { createChromeDriver, createComputerUseDriver } from './host-browser-drivers.mjs';

// Literal visible-text contracts avoid regenerating callback boilerplate.
// Complex acceptance rules retain the original callback API.
export function defineTask({ goal, stages, proof, reject = [] }) {
  text(goal, 10000); requireValue(goal.trim().length > 0, 'INVALID_HOST_TASK');
  const literals = (values, min) => {
    requireValue(Array.isArray(values) && values.length >= min && values.length <= 20 &&
      values.every(v => typeof v === 'string' ? v.trim().length > 0 && v.length <= 2000 :
        v && Object.keys(v).length === 1 && Array.isArray(v.anyOf) && v.anyOf.length >= 1 && v.anyOf.length <= 5 &&
        v.anyOf.every(s => typeof s === 'string' && s.trim().length > 0 && s.length <= 2000)), 'INVALID_HOST_LITERAL_PROOF');
    return values.map(v => typeof v === 'string' ? [v] : [...v.anyOf]);
  };
  const required = literals(proof, 1), forbidden = literals(reject, 0);
  requireValue(Array.isArray(stages) && stages.length > 0 && stages.length <= 10, 'INVALID_HOST_TASK');
  const steps = stages.map((stage, i) => {
    text(stage.goal, 2000); requireValue(stage.goal.trim().length > 0, 'INVALID_HOST_STAGE');
    const until = stage.until === undefined ? null : literals(stage.until, 1);
    return { id: 'stage_' + i, goal: stage.goal,
      complete: o => until !== null && until.every(variants => variants.some(value => o.snapshot.includes(value))) };
  });
  return { goal, stages: steps,
    invariant: o => { const found = forbidden.flat().filter(value => o.snapshot.includes(value)); return { ok: !found.length, evidence: found.join(' | ') || null }; },
    verify: o => { const found = required.map(variants => variants.find(value => o.snapshot.includes(value))); const passed = found.every(Boolean); return { passed, evidence: passed ? found.join(' | ') : null }; },
  };
}

// Keep the full run in the host variable; send only the receipt to the model.
// This never changes execution, verification requirements or measured usage.
export function summarizeHostResult(result) {
  const truncatedFields = [];
  const clip = (value, limit, field) => {
    if (value == null) return null;
    const string = typeof value === 'string' ? value : JSON.stringify(value);
    if (string.length > limit) truncatedFields.push(field);
    return string.slice(0, limit);
  };
  const decision = result.lastDecision?.decision;
  const receipt = {
    status: result.status, reason: result.reason, stageIndex: result.stageIndex,
    evidence: clip(result.evidence, 1500, 'evidence'),
    stateMayHaveChanged: result.stateMayHaveChanged,
    metrics: { ...result.metrics }, sessionMetrics: { ...result.sessionMetrics },
    instruction: result.instruction, fullResultRetainedInHost: true,
  };
  if (result.status !== 'needs_verification') {
    receipt.snapshot = clip(result.snapshot, 4000, 'snapshot');
    receipt.lastDecision = result.lastDecision ? {
      stage: result.lastDecision.stage, action: clip(result.lastDecision.action, 180, 'action'),
      reason: result.lastDecision.reason, choice: decision?.choice,
      probability: decision?.probabilities?.[decision?.choice],
    } : null;
    receipt.recentActions = result.history.slice(-4).map(h => ({
      action: clip(h.action, 180, 'history.action'), stage: h.stage, progress: h.progress,
    }));
    if (result.history.length > 4) truncatedFields.push('history');
  }
  return { ...receipt, truncatedFields };
}

export function createSession({ workspace, taskId, driver, store, send = hostTransport, key, maxSteps = 12, maxMs = 45000, minProbability = .7 }) {
  requireValue(typeof taskId === 'string' && /^[\w.:-]{1,128}$/.test(taskId), 'REAL_TASK_ID_REQUIRED');
  requireValue(driver && ['chrome', 'computer-use'].includes(driver.kind) && typeof driver.observe === 'function' && typeof driver.execute === 'function', 'INVALID_HOST_DRIVER');
  requireValue(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 20 && maxMs > 0 && maxMs <= 45000 && minProbability >= 0 && minProbability <= 1, 'INVALID_HOST_BUDGET');
  const ownsStore = !store; store ||= new Store();
  let project; try { project = store.project(workspace); } catch (e) { if (ownsStore) store.close(); throw e; }
  const id = randomUUID(), history = [];
  const totals = { runs: 0, actions: 0, jevRequests: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0, apiMs: 0, elapsedMs: 0, handoffs: 0 };
  let busy = false, closed = false, contract, stageIndex = 0, blockedHash = null;
  const metrics = () => ({ ...totals });
  return {
    metrics,
    close() { requireValue(!busy, 'HOST_SESSION_BUSY'); closed = true; if (ownsStore) store.close(); },
    async run(task) {
      requireValue(!closed && !busy, 'HOST_SESSION_BUSY');
      text(task.goal, 10000);
      requireValue(task.goal.length > 0 && Array.isArray(task.stages) && task.stages.length > 0 && task.stages.length <= 10 && typeof task.verify === 'function', 'INVALID_HOST_TASK');
      for (const stage of task.stages) { text(stage.id, 128); text(stage.goal, 2000); requireValue(stage.id.length > 0 && stage.goal.length > 0 && typeof stage.complete === 'function', 'INVALID_HOST_STAGE'); }
      requireValue(new Set(task.stages.map(s => s.id)).size === task.stages.length, 'DUPLICATE_HOST_STAGE');
      requireValue(!contract || contract === task, 'NEW_TASK_REQUIRES_SESSION'); contract = task;
      busy = true; totals.runs++;
      const start = performance.now(), prior = metrics(), phases = [], session = id + '-' + totals.runs;
      let current, status = 'codex_review_required', reason = null, evidence = null, stateMayHaveChanged = false, lastDecision = null;
      const timed = async (phase, fn) => { const t = performance.now(); try { return await fn(); } finally { phases.push({ phase, ms: performance.now() - t }); } };
      const expired = () => performance.now() - start >= maxMs || task.signal?.aborted;
      try {
        requireValue(totals.runs <= 8 && totals.actions < 80, 'HOST_SESSION_BUDGET');
        // Do not spend a paid request on the last fraction of a network deadline.
        // Other Judge callers retain their existing admission policy.
        const config = { ...loadConfig(store, project), cacheMs: 0, maxCalls: maxSteps,
          minimumRequestAllowanceMs: send === hostTransport ? 1000 : 100 };
        const judge = new Judge({ store, project, taskId, config, ...(key !== undefined ? { key } : {}), signal: task.signal,
          send: async (...args) => {
            totals.jevRequests++; const t = performance.now();
            try { const response = await send(...args); const u = response.usage;
              if (Number.isFinite(u?.input_tokens) && Number.isFinite(u?.output_tokens)) { totals.inputTokens += u.input_tokens; totals.outputTokens += u.output_tokens; } else totals.unknownUsage++;
              return response;
            } catch (e) { totals.unknownUsage++; throw e; } finally { totals.apiMs += performance.now() - t; }
          } });
        const ctx = { store, project, config, judge };
        current = await timed('observe', () => driver.observe());
        requireValue(!blockedHash || current.semanticHash !== blockedHash, 'HOST_HANDOFF_STATE_UNCHANGED');
        blockedHash = null;
        let stateRefreshes = 0;
        for (let step = 0; step <= maxSteps; step++) {
          if (expired()) { reason = task.signal?.aborted ? 'CANCELLED' : 'HOST_TIME_BUDGET'; break; }
          // Check identity/invariants before accepting any completion claim.
          const invariant = task.invariant ? await task.invariant(current, task.stages[stageIndex]?.id) : { ok: true };
          if (invariant?.ok !== true) { reason = 'HOST_INVARIANT_FAILED'; evidence = invariant?.evidence || null; break; }
          const proof = await task.verify(current);
          if (proof?.passed === true && proof.evidence) { status = 'needs_verification'; evidence = proof.evidence; break; }
          while (stageIndex < task.stages.length && (await task.stages[stageIndex].complete(current)) === true) stageIndex++;
          if (expired()) { reason = task.signal?.aborted ? 'CANCELLED' : 'HOST_TIME_BUDGET'; break; }
          if (stageIndex === task.stages.length) { reason = 'HOST_FINAL_PROOF_MISSING'; break; }
          if (step === maxSteps) { reason = 'HOST_STEP_BUDGET'; break; }
          if (!current.candidates.some(c => !c.requiresApproval && !c.destructive)) { reason = 'HOST_NO_ALLOWED_ACTION'; break; }
          judge.config.timeoutMs = Math.max(1, Math.min(config.timeoutMs, Math.floor(maxMs - (performance.now() - start))));
          const stage = task.stages[stageIndex];
          const next = await timed('decision', () => browserStep(ctx, { ...current, driver: driver.kind, session, goal: task.goal, subgoal: stage.goal,
            history: history.slice(-8).map(({ action, stage, progress }) => ({ action, stage, progress })), maxSteps }));
          lastDecision = { stage: stage.id, action: next.action?.text || null, decision: next.decision || null, reason: next.reason || null };
          if (!next.ticket) { reason = next.reason || 'HOST_MODEL_REVIEW'; break; }
          const probability = next.decision?.probabilities?.[next.decision.choice];
          if (!Number.isFinite(probability) || probability < minProbability) { reason = 'HOST_AMBIGUOUS_CHOICE'; break; }
          if (expired()) { reason = 'HOST_TIME_BUDGET'; break; }
          const fresh = await timed('revalidate', () => driver.observe());
          if (expired()) { reason = 'HOST_TIME_BUDGET'; current = fresh; break; }
          if (fresh.snapshot !== current.snapshot && driver.reobserveOnChange === true) {
            // Translation can arrive during judgment. Never execute the old
            // ticket: discard it and re-evaluate the fresh bounded state once.
            // This consumes the existing step, wait and call budgets.
            const discarded = store.get(project, 'browser_ticket', next.ticket);
            if (discarded) { discarded.consumed = true; store.put(project, 'browser_ticket', discarded, next.ticket); }
            current = fresh;
            if (stateRefreshes++ === 0) continue;
            reason = 'STALE_OBSERVATION'; break;
          }
          const permitted = consumeBrowserTicket(ctx, { driver: driver.kind, ticket: next.ticket, snapshot: fresh.snapshot });
          const action = fresh.candidates.find(c => c.id === permitted.action.id && c.text === permitted.action.text && c.target === permitted.action.target && c.op === permitted.action.op);
          requireValue(action && !action.requiresApproval && !action.destructive, 'HOST_ACTION_CHANGED');
          stateMayHaveChanged = true;
          await timed('execute', () => driver.execute(action)); totals.actions++;
          const after = await timed('observe', () => driver.observe());
          stateMayHaveChanged = false;
          const progress = current.semanticHash !== after.semanticHash;
          history.push({ action: action.text.slice(0, 1000), stage: stage.id, progress, probability });
          current = after;
          if (!progress) { reason = 'HOST_NO_OBSERVED_PROGRESS'; break; }
        }
      } catch (e) { reason = /^[A-Z][A-Z0-9_]+$/.test(e.code || e.message || '') ? e.code || e.message : 'HOST_DRIVER_ERROR'; }
      finally { totals.elapsedMs += performance.now() - start; if (status !== 'needs_verification') totals.handoffs++; busy = false; }
      const runMetrics = Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] - prior[k]]));
      runMetrics.runs = 1;
      if (['HOST_AMBIGUOUS_CHOICE', 'HOST_INVARIANT_FAILED', 'HOST_NO_OBSERVED_PROGRESS', 'no_safe_candidate'].includes(reason)) blockedHash = current?.semanticHash || null;
      store.event(project, 'browser_host_run', { driver: driver.kind, status, reason, stageIndex, ...runMetrics, nativeGptUsage: null });
      return { status, reason, evidence, stageIndex, lastDecision, history: history.slice(-20), snapshot: current?.snapshot || null, stateMayHaveChanged, metrics: runMetrics, sessionMetrics: metrics(), phases,
        instruction: status === 'needs_verification' ? 'Codex must independently verify the final observed outcome.' : 'Continue with native Codex; observe freshly before any further action, preserve the task and completed work.' };
    },
  };
}
