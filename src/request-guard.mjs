import { createHash, randomUUID } from 'node:crypto';
const keyOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const denied = code => { throw Object.assign(new Error(code), { code }); };
export const GUARD_DEFAULTS = { taskMaxCalls: 40, taskMaxBytes: 500000, taskMaxWaitMs: 20000, budgetWindowMs: 3600000, failureThreshold: 3, cooldownMs: 30000 };

// Reservations live in SQLite so MCP calls and the desktop bridge share limits.
// UTF-8 request bytes are an admission budget, not measured/billable tokens.
export class RequestGuard {
  constructor({ store, project, taskId, config = {}, clock = Date.now }) {
    Object.assign(this, { store, project, taskId, clock });
    this.config = { ...GUARD_DEFAULTS, ...config };
  }
  // A read-only admission hint, not a reservation. Actual requests still reserve
  // transactionally; another caller can consume capacity after this snapshot.
  capacity({ model, priority = 'routine' }) {
    const now = this.clock(), cfg = this.config, urgent = priority === 'urgent';
    const scope = this.taskId ? 'task' : 'workspace-window';
    const id = keyOf({ scope, task: this.taskId || this.project, window: Math.floor(now / cfg.budgetWindowMs) });
    const state = this.store.get(this.project, 'task_budget', id) || { calls: 0, bytes: 0, elapsedMs: 0, reservations: {} };
    const circuit = this.store.get(this.project, 'circuit', keyOf({ model })) || {};
    const pendingMs = Object.values(state.reservations).reduce((sum, p) => sum + p.allowance, 0);
    const reserved = (value, total) => urgent ? 0 : Math.min(value || 0, Math.floor(total * .2));
    return {
      calls: Math.max(0, cfg.taskMaxCalls - state.calls - reserved(cfg.taskReservedCalls, cfg.taskMaxCalls)),
      bytes: Math.max(0, cfg.taskMaxBytes - state.bytes - reserved(cfg.taskReservedBytes, cfg.taskMaxBytes)),
      waitMs: Math.max(0, cfg.taskMaxWaitMs - state.elapsedMs - pendingMs - reserved(cfg.taskReservedWaitMs, cfg.taskMaxWaitMs)),
      cooldown: circuit.openUntil > now || circuit.probeUntil > now,
      windowEndsAt: (Math.floor(now / cfg.budgetWindowMs) + 1) * cfg.budgetWindowMs,
    };
  }
  reserve({ bytes, timeoutMs, model, priority='routine' }) {
    const now = this.clock(), cfg = this.config;
    const scope = this.taskId ? 'task' : 'workspace-window';
    const id = keyOf({ scope, task: this.taskId || this.project, window: Math.floor(now / cfg.budgetWindowMs) });
    const circuitId = keyOf({ model });
    return this.store.transaction(() => {
      const circuit = this.store.get(this.project, 'circuit', circuitId) || { failures: 0, openUntil: 0 };
      if (circuit.openUntil > now || circuit.probeUntil > now) denied('JEV_COOLDOWN');
      const state = this.store.get(this.project, 'task_budget', id) || { calls: 0, bytes: 0, elapsedMs: 0, reservations: {} };
      for (const [token, pending] of Object.entries(state.reservations)) if (pending.expiresAt <= now) {
        state.elapsedMs += pending.allowance; delete state.reservations[token];
      }
      const pendingMs = Object.values(state.reservations).reduce((sum, p) => sum + p.allowance, 0);
      if (state.calls >= cfg.taskMaxCalls) denied('TASK_CALL_BUDGET');
      if (state.bytes + bytes > cfg.taskMaxBytes) denied('TASK_INPUT_BUDGET');
      const reserveCalls=Math.min(cfg.taskReservedCalls||0,Math.floor(cfg.taskMaxCalls*.2));
      const reserveWait=Math.min(cfg.taskReservedWaitMs||0,Math.floor(cfg.taskMaxWaitMs*.2));
      const reserveBytes=Math.min(cfg.taskReservedBytes||0,Math.floor(cfg.taskMaxBytes*.2));
      const remaining=cfg.taskMaxWaitMs-state.elapsedMs-pendingMs;
      if(priority!=='urgent' && ((reserveBytes>0&&state.bytes+bytes>cfg.taskMaxBytes-reserveBytes)||(reserveCalls>0&&state.calls>=cfg.taskMaxCalls-reserveCalls) || (reserveWait>0&&remaining-reserveWait<100)))denied('TASK_URGENT_RESERVE');
      const allowance = Math.min(timeoutMs, remaining-(priority==='urgent'?0:reserveWait));
      const minimumAllowance = Math.max(100, Number.isFinite(cfg.minimumRequestAllowanceMs) ? cfg.minimumRequestAllowanceMs : 100);
      if (allowance < minimumAllowance) denied('TASK_WAIT_BUDGET');
      const token = randomUUID(), expiresAt = now + allowance + 1000;
      state.calls++; state.bytes += bytes; state.scope = scope; state.windowEndsAt = (Math.floor(now / cfg.budgetWindowMs) + 1) * cfg.budgetWindowMs;
      state.reservedCalls=reserveCalls;state.reservedWaitMs=reserveWait;state.reservedBytes=reserveBytes;
      state.reservations[token] = { allowance, expiresAt };
      this.store.put(this.project, 'task_budget', state, id);
      if (circuit.failures >= cfg.failureThreshold) { circuit.probeToken = token; circuit.probeUntil = expiresAt; this.store.put(this.project, 'circuit', circuit, circuitId); }
      return { id, circuitId, token, allowance, requestedTimeoutMs: timeoutMs, availableWaitMs: remaining-(priority==='urgent'?0:reserveWait), scope, startedAt: now, generation: circuit.generation || 0 };
    });
  }
  finish(reservation, { status, elapsedMs }) {
    const now = this.clock(), cfg = this.config;
    this.store.transaction(() => {
      const state = this.store.get(this.project, 'task_budget', reservation.id);
      if (!state?.reservations[reservation.token]) return;
      state.elapsedMs += Math.max(0, Math.min(elapsedMs, reservation.allowance));
      delete state.reservations[reservation.token]; this.store.put(this.project, 'task_budget', state, reservation.id);
      const circuit = this.store.get(this.project, 'circuit', reservation.circuitId) || { failures: 0, openUntil: 0 };
      if (circuit.probeToken === reservation.token) { delete circuit.probeUntil; delete circuit.probeToken; }
      // A late success from before an outage must not close a newer circuit.
      if (status === 'success' && reservation.generation === (circuit.generation || 0)) { circuit.failures = 0; circuit.openUntil = 0; }
      else if (status !== 'success' && status !== 'cancelled') { circuit.failures++; if (circuit.failures >= cfg.failureThreshold) { circuit.openUntil = now + cfg.cooldownMs; circuit.generation = (circuit.generation || 0) + 1; } }
      this.store.put(this.project, 'circuit', circuit, reservation.circuitId);
    });
  }
}
