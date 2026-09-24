import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, hash } from '../src/core.mjs';
import { createSession, createChromeDriver, createComputerUseDriver } from '../src/host-browser-session.mjs';
import { semanticState } from '../src/host-browser-drivers.mjs';
import { RequestGuard } from '../src/request-guard.mjs';

function fixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'host-session-')), workspace = join(root, 'project'); mkdirSync(workspace);
  const store = new Store({ home: join(root, 'state') }); t.after(() => store.close());
  let screen = 0, reads = 0, clicks = 0; const requests = [];
  const driver = { kind: 'chrome', observe: async () => {
    reads++; const snapshot = options.snapshot ? options.snapshot(screen, reads) : 'screen ' + screen;
    return { snapshot, semanticHash: hash(semanticState(snapshot)), observedAt: Date.now(), candidates: [{ id: 'next', text: 'Open next view', target: 1, op: 'click', ...(options.blocked ? { requiresApproval: true } : {}) }] };
  }, execute: async () => { clicks++; if (!options.noEffect) screen++; if (options.executeError) throw Error('unknown driver detail'); } };
  const send = async payload => {
    requests.push(payload); if (options.networkError) throw Error('network failure');
    if (options.delay) await new Promise(r => setTimeout(r, options.delay));
    const p = options.probability ?? .95;
    return { model: 'fixture', answers: { next: { type: 'choice', choice: 'action_0', probabilities: { action_0: p, review: 1 - p } } }, usage: { input_tokens: 100, output_tokens: 10 } };
  };
  const session = createSession({ workspace, taskId: 'real-test-task', store, key: 'fixture', driver, send, ...options.session });
  const task = { goal: 'Inspect the correct result', stages: [
    { id: 'open', goal: 'Open the record', complete: () => screen >= 1 },
    { id: 'inspect', goal: 'Inspect the record', complete: () => screen >= 2 },
  ], verify: () => ({ passed: screen === 2, evidence: screen === 2 ? 'visible exact result' : null }) };
  return { session, task, store, workspace, requests, driver, clicks: () => clicks, reads: () => reads, setScreen: n => { screen = n; } };
}
test('one run executes multiple stages and records real request usage with prior action context', async t => {
  const f = fixture(t), r = await f.session.run(f.task);
  assert.equal(r.status, 'needs_verification'); assert.equal(r.metrics.actions, 2); assert.equal(f.reads(), 5);
  assert.equal(r.metrics.jevRequests, 2); assert.equal(r.metrics.inputTokens, 200);
  assert.equal(f.requests[0].state.goal, 'Open the record');
  assert.equal(f.requests[1].state.goal, 'Inspect the record');
  assert.deepEqual(f.requests[1].state.history, [{ action: 'Open next view', stage: 'open', progress: true }]);
});
test('identity invariant rejects wrong record even if completion callback claims success', async t => {
  const f = fixture(t); f.task.invariant = () => ({ ok: false, evidence: 'wrong record' });
  f.task.verify = () => ({ passed: true, evidence: 'looks complete' });
  const r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_INVARIANT_FAILED'); assert.equal(f.requests.length, 0); assert.equal(f.clicks(), 0);
});
test('ambiguous choice hands back before clicking and counts charged request', async t => {
  const f = fixture(t, { probability: .59 }), r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_AMBIGUOUS_CHOICE'); assert.equal(f.clicks(), 0); assert.equal(r.metrics.jevRequests, 1);
});
test('focus or AX numbering alone is not progress; no second paid judgment', async t => {
  const f = fixture(t, { noEffect: true, snapshot: (s, read) => `${read} button Next\nThe focused UI element is ${read} button Next` });
  // Revalidation must remain exact; vary only the post-action observation.
  let n = 0; f.driver.observe = async () => { n++; const snapshot = `${n <= 2 ? 1 : 9} button Next\nThe focused UI element is ${n <= 2 ? 1 : 9} button Next`; return { snapshot, semanticHash: hash(semanticState(snapshot)), observedAt: Date.now(), candidates: [{ id: 'next', text: 'Open next view', target: 1, op: 'click' }] }; };
  const r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_NO_OBSERVED_PROGRESS'); assert.equal(f.requests.length, 1); assert.equal(f.clicks(), 1);
});
test('stale observation never executes the earlier target', async t => {
  const f = fixture(t, { snapshot: (s, n) => 'changed ' + n }), r = await f.session.run(f.task);
  assert.equal(r.reason, 'STALE_OBSERVATION'); assert.equal(f.clicks(), 0);
});
test('deadline expiring while awaiting model prevents execution', async t => {
  const f = fixture(t, { delay: 200, session: { maxMs: 150 } }), r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_TIME_BUDGET'); assert.equal(f.clicks(), 0);
});
test('consequential actions stop locally without a paid request', async t => {
  const f = fixture(t, { blocked: true }), r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_NO_ALLOWED_ACTION'); assert.equal(f.requests.length, 0);
});
test('uncertain execution stops, reports possibly changed state and never retries', async t => {
  const f = fixture(t, { executeError: true }), r = await f.session.run(f.task);
  assert.equal(r.reason, 'HOST_DRIVER_ERROR'); assert.equal(r.stateMayHaveChanged, true); assert.equal(f.clicks(), 1);
});
test('resuming after native intervention retains metrics and stage progress', async t => {
  const f = fixture(t, { session: { maxSteps: 1 } });
  const a = await f.session.run(f.task); assert.equal(a.reason, 'HOST_STEP_BUDGET');
  const b = await f.session.run(f.task); assert.equal(b.status, 'needs_verification');
  assert.equal(b.sessionMetrics.actions, 2); assert.equal(b.sessionMetrics.jevRequests, 2); assert.equal(b.metrics.actions, 1);
});
test('task budget applies across fresh host sessions', async t => {
  const f = fixture(t); f.store.put(f.store.project(f.workspace), 'config', { taskMaxCalls: 0 }, 'settings');
  const r = await f.session.run(f.task); assert.equal(r.reason, 'TASK_CALL_BUDGET'); assert.equal(f.requests.length, 0);
});
test('overlapping run calls cannot execute concurrently', async t => {
  const f = fixture(t, { delay: 10 }), pending = f.session.run(f.task);
  await assert.rejects(f.session.run(f.task), /HOST_SESSION_BUSY/); await pending;
});
test('Chrome adapter preserves origins, rejects duplicates, disabled and blocked actions', async () => {
  let raw = 'Browser tab: 1, Title: "test", URL: "https://example.com/".\n1 button Read\n2 button Same\n3 button Same\n4 button (disabled) Hidden\n5 button Delete';
  const tab = { ax: { get: async () => raw, click: async () => {} } };
  const driver = createChromeDriver({ tab, allowedOrigins: ['https://example.com'], policy: { allowNames: [/./] } });
  const state = await driver.observe(); assert.deepEqual(state.candidates.map(x => x.text), ['Read', 'Delete']); assert.equal(state.candidates[1].requiresApproval, true);
  raw = raw.replace('example.com', 'other.example'); await assert.rejects(driver.observe(), /HOST_ORIGIN_CHANGED/);
});
test('Computer Use uses fresh native indexes and preserves exact application', async () => {
  const calls = [], sky = { get_app_state: async input => { calls.push(input); return { text: '9 按钮 展开详情' }; }, click: async input => calls.push(input) };
  const driver = createComputerUseDriver({ sky, app: 'com.example.App', policy: { allowNames: ['展开详情'] }, scope: raw => raw });
  await driver.execute((await driver.observe()).candidates[0]);
  assert.deepEqual(calls, [{ app: 'com.example.App', disableDiff: true }, { app: 'com.example.App', element_index: 9 }]);
});
test('unchanged ambiguous handoff is not charged repeatedly; native progress permits resume', async t => {
  const f = fixture(t, { probability: .59 });
  assert.equal((await f.session.run(f.task)).reason, 'HOST_AMBIGUOUS_CHOICE');
  assert.equal((await f.session.run(f.task)).reason, 'HOST_HANDOFF_STATE_UNCHANGED');
  assert.equal(f.requests.length, 1);
  f.setScreen(2);
  assert.equal((await f.session.run(f.task)).status, 'needs_verification');
  assert.equal(f.requests.length, 1);
});
test('app scoping must be explicit and must retain an actual observed substring', async () => {
  const options = { sky: { get_app_state: async () => ({ text: 'actual app state' }), click: async () => {} }, app: 'test', policy: { allowNames: ['Open'] } };
  assert.throws(() => createComputerUseDriver(options), /HOST_APP_SCOPE_REQUIRED/);
  await assert.rejects(createComputerUseDriver({ ...options, scope: () => 'invented state' }).observe(), /INVALID_HOST_SCOPE/);
});
test('host admission leaves a subsecond remainder uncharged and preserves ordinary policy', t => {
  const f = fixture(t);
  const config = { taskMaxWaitMs: 1268, minimumRequestAllowanceMs: 1000 };
  const g = new RequestGuard({ store: f.store, project: f.store.project(f.workspace), taskId: 'bounded', config });
  const a = g.reserve({ bytes: 1, timeoutMs: 1000, model: 'fixture' });
  g.finish(a, { status: 'success', elapsedMs: 1000 });
  assert.throws(() => g.reserve({ bytes: 1, timeoutMs: 1000, model: 'fixture' }), /TASK_WAIT_BUDGET/);
  assert.equal(f.store.get(g.project, 'task_budget', a.id).calls, 1);
  const ordinary = new RequestGuard({ store: f.store, project: g.project, taskId: 'bounded', config: { taskMaxWaitMs: 1268 } });
  assert.equal(ordinary.reserve({ bytes: 1, timeoutMs: 1000, model: 'fixture' }).allowance, 268);
});
