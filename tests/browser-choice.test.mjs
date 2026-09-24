import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, Judge, loadConfig } from '../src/core.mjs';
import { browserStep, consumeBrowserTicket } from '../src/browser.mjs';

function fixture(t, pick = () => 'action_0') {
  const root = mkdtempSync(join(tmpdir(), 'browser-choice-'));
  mkdirSync(join(root, 'project'));
  const store = new Store({ home: join(root, 'state') }); t.after(() => store.close());
  const project = store.project(join(root, 'project')), config = { ...loadConfig(store, project), cacheMs: 0 };
  const requests = [];
  const judge = new Judge({ store, project, config, key: 'fixture', send: async payload => {
    requests.push(payload); const choice = pick(payload);
    if (choice instanceof Error) throw choice;
    const criteria = payload.questions.next.criteria;
    return { model: 'fixture', answers: { next: { type: 'choice', choice, probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0])) } } };
  } });
  const input = { driver: 'chrome', session: 's', goal: 'Open the requested record', snapshot: 'Observed controls', observedAt: Date.now(), candidates: [{ id: 'a', text: 'Open record', target: 42 }] };
  return { ctx: { store, project, config, judge }, input, requests };
}
test('40 candidates require one exclusive question; reserved-looking ids cannot collide', async t => {
  const f = fixture(t, () => 'action_39');
  f.input.candidates = Array.from({ length: 40 }, (_, i) => ({ id: i === 39 ? 'review' : String(i), text: 'Record ' + i, target: i }));
  const r = await browserStep(f.ctx, f.input);
  assert.equal(r.action.id, 'review'); assert.equal(f.requests.length, 1);
  assert.equal(Object.keys(f.requests[0].questions).length, 1);
  assert.equal(Object.keys(f.requests[0].questions.next.criteria).length, 41);
  assert.equal(r.decision.choice, 'action_39');
});
test('locally blocked actions never become choices and all-blocked costs no call', async t => {
  const f = fixture(t);
  f.input.candidates = [{ id: 'delete', text: 'Delete', destructive: true }, { id: 'pay', text: 'Pay', requiresApproval: true }];
  assert.equal((await browserStep(f.ctx, f.input)).status, 'codex_review_required');
  assert.equal(f.requests.length, 0);
  f.input.candidates.push({ id: 'read', text: 'Preview' });
  assert.equal((await browserStep(f.ctx, f.input)).action.id, 'read');
  assert.equal(Object.keys(f.requests[0].questions.next.criteria).length, 2);
});
test('review supersedes an outstanding action without pretending to classify other candidates', async t => {
  let review = false; const f = fixture(t, () => review ? 'review' : 'action_0');
  const first = await browserStep(f.ctx, f.input); review = true;
  const second = await browserStep(f.ctx, { ...f.input, snapshot: 'new observation' });
  assert.equal(second.status, 'codex_review_required'); assert.equal(second.decision.choice, 'review');
  assert.equal(second.judgments[0].source, 'policy');
  assert.throws(() => consumeBrowserTicket(f.ctx, { ticket: first.ticket, snapshot: f.input.snapshot, driver: 'chrome' }), /SUPERSEDED_BROWSER_TICKET/);
});
test('network failure and malformed choice fail closed; no automatic retries', async t => {
  for (const outcome of [Object.assign(new Error('offline'), { code: 'UNAVAILABLE' }), 'unknown']) {
    const f = fixture(t, () => outcome), r = await browserStep(f.ctx, f.input);
    assert.equal(r.status, 'codex_review_required'); assert.equal(r.ticket, undefined);
    assert.equal(r.judgments[0].source, 'fallback'); assert.equal(f.requests.length, 1);
  }
});
test('unchanged action loop stops locally without another paid request', async t => {
  const f = fixture(t); await browserStep(f.ctx, f.input);
  assert.equal((await browserStep(f.ctx, f.input)).reason, 'unchanged_action_loop'); assert.equal(f.requests.length, 1);
});
test('candidate metadata remains available for semantic disambiguation', async t => {
  const f = fixture(t); f.input.candidates[0].context = { invoice: 'INV-204', currency: 'EUR', amount: 1240 };
  await browserStep(f.ctx, f.input);
  assert.deepEqual(f.requests[0].questions.next.criteria.action_0, f.input.candidates[0]);
});
test('long candidate sets retain the established batched path instead of losing functionality', async t => {
  const f = fixture(t), batches = [];
  f.input.candidates = Array.from({length: 40}, (_, i) => ({id: 'row' + i, text: 'Visible record '.repeat(70) + i}));
  f.ctx.judge.send = async payload => {
    batches.push(payload);
    return {model: 'fixture', answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => [id, {type: 'choice', choice: 'use', probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === 'use' ? 1 : 0]))}]))};
  };
  const result = await browserStep(f.ctx, f.input);
  assert.equal(result.status, 'candidate_selected');
  assert.equal(result.action.id, 'row0'); assert.equal(batches.length, 2);
  assert.equal(batches.reduce((sum, p) => sum + Object.keys(p.questions).length, 0), 40);
  assert.equal(result.judgments.every(j => j.source === 'jev'), true);
});
