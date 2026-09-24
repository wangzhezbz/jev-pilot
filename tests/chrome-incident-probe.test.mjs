import test from 'node:test';
import assert from 'node:assert/strict';
import { runChromeIncident } from '../scripts/acceptance/chrome-incident-probe.mjs';
import { cases } from '../scripts/acceptance/browser-incident-probe.mjs';

function fixture(result = cases['identity-recovery'].proof) {
  const task = cases['identity-recovery'];
  let step = 0, clicks = 0;
  const snapshot = () => 'URL: 127.0.0.1:18743/browser-incident-fixture.html\nJevPilot synthetic incident review\n' + (step < 6 ? `1 button ${task.plan[step]}` : result);
  const tab = { reload: async () => { step = 0; }, ax: { get: async () => snapshot(), click: async () => { step++; clicks++; } } };
  return { tab, clicks: () => clicks, post: async () => { throw Error('DIRECT_MUST_NOT_PAY'); } };
}
test('Chrome probe requires exact incident and event proof after six real driver actions', async () => {
  const f = fixture(), r = await runChromeIncident({ ...f, arm: 'direct', session: 'test', caseId: 'identity-recovery' });
  assert.equal(r.passed, true); assert.equal(f.clicks(), 6); assert.equal(r.gptUsage, null);
  assert.equal(r.trace.at(-1).snapshot.includes(cases['identity-recovery'].proof), true);
});
test('similar success text with the wrong event is a failure, never an accepted result', async () => {
  const f = fixture(cases['identity-recovery'].proof.replace('k17', 'r42'));
  const r = await runChromeIncident({ ...f, arm: 'direct', session: 'test', caseId: 'identity-recovery' });
  assert.equal(r.passed, false); assert.equal(r.proof, null); assert.match(r.error, /MISSING_ACTION/);
});
test('review preserves full input and probabilities without clicking or retrying', async () => {
  const f = fixture(); let calls = 0;
  f.post = async () => { calls++; return { status: 'codex_review_required', reason: 'no_safe_candidate', decision: { choice: 'review', probabilities: { review: 1 } } }; };
  const r = await runChromeIncident({ ...f, arm: 'choice', session: 'test', caseId: 'identity-recovery' });
  assert.equal(calls, 1); assert.equal(f.clicks(), 0); assert.equal(r.passed, false);
  assert.equal(r.trace.at(-1).input.goal, cases['identity-recovery'].goal);
  assert.equal(r.decisions[0].decision.probabilities.review, 1);
});
test('consumed action must match a freshly observed safe candidate', async () => {
  const f = fixture();
  f.post = async path => path === '/step' ? { ticket: 'test', status: 'candidate_selected' } : { action: { id: 'ax_9', text: 'Unobserved control', target: 9 } };
  const r = await runChromeIncident({ ...f, arm: 'choice', session: 'test', caseId: 'identity-recovery' });
  assert.equal(r.error, 'UNOBSERVED_ACTION'); assert.equal(f.clicks(), 0);
});
