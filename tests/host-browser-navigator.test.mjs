import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, hash } from '../src/core.mjs';
import { RequestGuard } from '../src/request-guard.mjs';
import { createNavigator } from '../src/host-browser-navigator.mjs';

function setup(t, { config = {}, probability = .95, failFinalRead = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'host-navigator-')), workspace = join(dir, 'work'); mkdirSync(workspace);
  const store = new Store({ home: join(dir, 'state') }), project = store.project(workspace); t.after(() => store.close());
  store.put(project, 'config', config, 'settings');
  let screen = 0, requests = 0, reads = 0;
  const driver = { kind: 'chrome', observe: async () => {
    reads++; if (failFinalRead && reads === 6) throw Error('native host failed');
    const snapshot = screen < 2 ? 'screen ' + screen : 'Record R42 | Approved | Preview';
    return { snapshot, semanticHash: hash(snapshot), observedAt: Date.now(), candidates: [{ id: 'next', text: 'Open details', target: 1, op: 'click' }] };
  }, execute: async () => { screen++; } };
  const send = async () => { requests++; return { model: 'fixture', answers: { next: { type: 'choice', choice: 'action_0', probabilities: { action_0: probability, review: 1 - probability } } }, usage: { input_tokens: 10, output_tokens: 2 } }; };
  const nav = createNavigator({ workspace, taskId: 'real-test-task', driver, store, send, key: 'fixture' }); t.after(() => nav.close());
  const spec = { goal: 'Find R42 and read its approved preview', expectedSteps: 2, proof: ['Record R42', 'Approved', 'Preview'] };
  return { nav, spec, store, project, requests: () => requests, reads: () => reads, screen: () => screen, setScreen: n => { screen = n; } };
}
test('navigator retains task and evidence, returns a fresh final read without claiming completion', async t => {
  const f = setup(t), receipt = await f.nav.run(f.spec);
  assert.equal(receipt.status, 'needs_verification'); assert.equal(receipt.metrics.jevRequests, 2);
  assert.equal(f.reads(), 6); assert.match(receipt.finalObservation.snapshot, /Record R42/);
  assert.match(receipt.instruction, /Codex must inspect/); assert.equal(f.nav.result.history.length, 2);
  assert.notEqual(receipt.finalObservation, f.nav.result.finalObservation);
});
test('insufficient capacity returns one native observation without actions, payment or quota changes', async t => {
  const f = setup(t, { config: { taskMaxCalls: 1 } }), before = f.store.list(f.project, 'task_budget');
  const result = await f.nav.run(f.spec);
  assert.equal(result.reason, 'HOST_INSUFFICIENT_TASK_BUDGET'); assert.equal(f.reads(), 1); assert.equal(f.requests(), 0);
  assert.equal(result.nativeObservation.snapshot,'screen 0');assert.equal(f.screen(),0);
  assert.equal(result.nextDelegation.maxAffordableSteps,1);assert.match(result.instruction,/Do not run diagnostics/);
  assert.deepEqual(f.store.list(f.project, 'task_budget'), before);
  await assert.rejects(f.nav.resume(), /HOST_NO_RESUMABLE_TASK/);
});
test('single actions stay native, invalid proof is rejected, cancellation makes no paid request', async t => {
  const f = setup(t);
  assert.equal((await f.nav.run({ ...f.spec, expectedSteps: 1 })).reason, 'HOST_NATIVE_SINGLE_ACTION');
  await assert.rejects(f.nav.run({ ...f.spec, proof: [] }), /INVALID_HOST_LITERAL_PROOF/);
  const controller = new AbortController(); controller.abort();
  assert.equal((await f.nav.run({ ...f.spec, signal: controller.signal })).reason, 'CANCELLED');
  assert.equal(f.requests(), 0); assert.equal(f.screen(), 0);
});
test('native recovery resumes the same task and never guesses an unchanged ambiguous state twice', async t => {
  const f = setup(t, { probability: .5 });
  assert.equal((await f.nav.run(f.spec)).reason, 'HOST_AMBIGUOUS_CHOICE');
  assert.equal((await f.nav.resume()).reason, 'HOST_HANDOFF_STATE_UNCHANGED'); assert.equal(f.requests(), 1);
  f.setScreen(2); assert.equal((await f.nav.resume()).status, 'needs_verification'); assert.equal(f.requests(), 1);
});
test('final read failure preserves completed actions and requires native verification', async t => {
  const f = setup(t, { failFinalRead: true }), r = await f.nav.run(f.spec);
  assert.equal(r.finalObservationError, 'HOST_FINAL_OBSERVATION_FAILED'); assert.equal(r.finalObservation, undefined);
  assert.equal(r.metrics.actions, 2); assert.match(r.instruction, /must observe again/);
});
test('capacity inspection counts pending and expired reservations, leaves state untouched, and protects urgent reserve', t => {
  const f = setup(t); let now = 10000;
  const guard = new RequestGuard({ store: f.store, project: f.project, taskId: 'budget', clock: () => now,
    config: { taskMaxCalls: 10, taskReservedCalls: 2, taskMaxWaitMs: 20000, taskReservedWaitMs: 4000, taskReservedBytes: 100000 } });
  assert.equal(guard.capacity({ model: 'fixture' }).waitMs, 16000);
  const reservation = guard.reserve({ bytes: 1000, timeoutMs: 5000, model: 'fixture' });
  const saved = f.store.get(f.project, 'task_budget', reservation.id);
  assert.equal(guard.capacity({ model: 'fixture' }).waitMs, 11000);
  now += 7000; assert.equal(guard.capacity({ model: 'fixture' }).waitMs, 11000);
  assert.deepEqual(f.store.get(f.project, 'task_budget', reservation.id), saved);
  assert.equal(guard.capacity({ model: 'fixture', priority: 'urgent' }).waitMs, 15000);
  assert.equal(guard.capacity({ model: 'fixture' }).calls, 7);
  const r = guard.reserve({ bytes: 1000, timeoutMs: 15000, model: 'fixture' }); assert.equal(r.allowance, 11000);
});

test('slow recent browser calls deny delegation early; unrelated and old models do not influence estimate', async t => {
  const f = setup(t, { config: { taskMaxWaitMs: 800 } });
  for (let i = 0; i < 3; i++) f.store.event(f.project, 'jev_call', { purpose: 'browser', status: 'success', model: 'jev-1.13.0', elapsedMs: 1000 });
  const r = await f.nav.run(f.spec);
  assert.equal(r.reason, 'HOST_INSUFFICIENT_TASK_BUDGET'); assert.equal(r.admission.requiredWaitMs, 1600); assert.equal(f.requests(), 0);
  const g = setup(t, { config: { taskMaxWaitMs: 800 } });
  for (let i = 0; i < 3; i++) g.store.event(g.project, 'jev_call', { purpose: 'browser', status: 'success', model: 'other', elapsedMs: 9000 });
  assert.equal((await g.nav.run(g.spec)).status, 'needs_verification');
});

test('cancelled refused goals do not observe; failed scoped reads do not leak state or retry', async t => {
  const f=setup(t,{config:{taskMaxCalls:1}}),controller=new AbortController();controller.abort();
  const cancelled=await f.nav.run({...f.spec,signal:controller.signal});
  assert.equal(f.reads(),0);assert.equal(cancelled.nativeObservation,undefined);assert.equal(f.requests(),0);
  const nav=createNavigator({workspace:f.store.home,taskId:'scoped-refusal',store:f.store,
    driver:{kind:'chrome',observe:async()=>{throw Error('private wrong origin');}}});
  t.after(()=>nav.close());f.store.put(f.store.project(f.store.home),'config',{taskMaxCalls:1},'settings');
  const r=await nav.run(f.spec);assert.equal(r.nativeObservation,undefined);assert.equal(r.nativeObservationError,'HOST_NATIVE_OBSERVATION_FAILED');
  assert(!JSON.stringify(r).includes('private wrong origin'));
});

test('new navigation calls share the real task quota and cannot restart a full budget', async t => {
  const f = setup(t, { config: { taskMaxCalls: 3 } });
  assert.equal((await f.nav.run(f.spec)).status, 'needs_verification');
  assert.equal(f.nav.result.nextDelegation.maxAffordableSteps,1);
  assert.equal((await f.nav.run(f.spec)).reason, 'HOST_INSUFFICIENT_TASK_BUDGET');
  assert.equal(f.requests(), 2);
});
