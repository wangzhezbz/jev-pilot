import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pilot } from '../src/pilot.mjs';
import { Store, Judge, loadConfig, redact, validateAnswers } from '../src/core.mjs';
import { runBrowserLoop } from '../src/browser.mjs';
function fixture(t, choose = () => null) {
  const base = mkdtempSync(join(tmpdir(), 'jev-pilot-test-')), root = join(base, 'project'); mkdirSync(root);
  const store = new Store({ home: join(base, 'private') }); let calls = 0;
  const send = async payload => {
    calls++;
    return { model: 'jev-fixture', usage: { input_tokens: 10, output_tokens: 2 }, answers: Object.fromEntries(Object.entries(payload.questions).map(([id, q]) => {
      const choice = choose(q, payload.state, id) || Object.keys(q.criteria)[0];
      return [id, { type: 'choice', choice, probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === choice ? 1 : 0])) }];
    })) };
  };
  const pilot = new Pilot({ store, key: 'fixture-key', send }); t.after(() => pilot.close());
  const call = (operation, input = {}) => pilot.call({ workspace: root, operation, input });
  const project = store.project(root), config = loadConfig(store, project), ctx = { root, store, project, config, judge: new Judge({ store, project, config, key: 'fixture-key', send }) };
  return { base, root, store, pilot, call, project, ctx, calls: () => calls };
}
test('batch decisions, cache hits, real-call metrics and no invented savings', async t => {
  const f = fixture(t); const input = { items: [{ id: 'a', text: 'apple' }, { id: 'b', text: 'pear' }], question: 'fruit?', choices: { yes: 'fruit', no: 'not fruit' } };
  assert.equal((await f.call('decide', input)).decisions.length, 2); await f.call('decide', input);
  const m = await f.call('metrics'); assert.equal(m.jev.calls, 1); assert.equal(m.jev.inputTokens, 10); assert.equal(m.cacheHits, 1); assert.equal(m.savings, null);
});
test('missing service preserves candidates for Codex, no fake Jev answer', async t => {
  const f = fixture(t); f.pilot.key = null;
  const r = await f.call('select', { goal: 'find', items: [{ id: 'a', text: 'source' }], budget: 128 });
  assert.equal(r.degraded, true); assert.equal(r.items.length, 1); assert.equal(r.items[0].judgment.source, 'fallback');
});
test('secrets redacted recursively and malformed probabilities rejected', () => {
  assert.equal(redact({ api_key: 'private', nested: ['Bearer abc', 'password=hunter'] }).api_key, '[REDACTED]');
  assert.throws(() => validateAnswers({ q: { type: 'choice', criteria: { a: '', b: '' } } }, { model: 'x', answers: { q: { type: 'choice', choice: 'a', probabilities: { a: 0, b: 1 } } } }));
});
test('budget is charged including citations, overflow preserved, original recoverable', async t => {
  const f = fixture(t); const r = await f.call('select', { goal: 'goal', budget: 128, items: [{ id: 'a', text: 'a'.repeat(200), pin: true }, { id: 'b', text: 'other'.repeat(100) }] });
  assert.equal(r.protectedOverflow, true); assert.deepEqual(r.deferredIds, ['b']); assert.equal(r.completeCoverage, false);
  const raw = await f.call('recall', { artifactId: r.artifactId }); assert.equal(raw.items[1].text.length, 500);
});
test('project isolation prevents artifact access across workspaces', async t => {
  const f = fixture(t), other = join(f.base, 'other'); mkdirSync(other);
  const r = await f.call('filter_output', { goal: 'goal', text: 'original' });
  await assert.rejects(f.pilot.call({ workspace: other, operation: 'recall', input: { artifactId: r.artifactId } }), /ARTIFACT_NOT_FOUND/);
});
test('source reader rejects traversal, secret paths and symlink escape', async t => {
  const f = fixture(t); writeFileSync(join(f.base, 'outside'), 'private'); writeFileSync(join(f.root, '.env.local'), 'secret');
  await assert.rejects(f.call('filter_output', { goal: 'goal', path: '../outside' }), /OUTSIDE_WORKSPACE/);
  await assert.rejects(f.call('filter_output', { goal: 'goal', path: '.env.local' }), /PRIVATE_PATH/);
  if (process.platform !== 'win32') { symlinkSync(join(f.base, 'outside'), join(f.root, 'link')); await assert.rejects(f.call('filter_output', { goal: 'goal', path: 'link' }), /OUTSIDE_WORKSPACE/); }
});
test('search returns exact source lines and excludes private paths', async t => {
  const f = fixture(t); writeFileSync(join(f.root, 'source.txt'), 'first\nneedle\nlast');
  const r = await f.call('search', { goal: 'needle', query: 'needle' }); assert.equal(r.items[0].source, 'source.txt'); assert.match(r.items[0].text, /needle/);
  writeFileSync(join(f.root, 'exact.txt'), 'use array[0]');
  writeFileSync(join(f.root, '.env.local'), 'array[0] private');
  const exact = await f.call('search', { goal: 'array access', query: 'array[0]', paths: ['exact.txt', '.env.local'] });
  assert.deepEqual(exact.items.map(x => x.source), ['exact.txt']); assert.equal(exact.excludedPathCount, 1);
});
test('search detects overflow within a single file instead of claiming complete coverage', async t => {
  const f=fixture(t);writeFileSync(join(f.root,'many.txt'),'needle\n'.repeat(5));
  const r=await f.call('search',{goal:'needle',query:'needle',maxMatches:2});assert.equal(r.candidateLimitReached,true);assert.equal(r.completeCoverage,false);
});
test('required tools survive all-skip decision', async t => {
  const f = fixture(t, () => 'skip'); const r = await f.call('select_tools', { goal: 'goal', tools: [{ id: 'a', text: 'tool' }, { id: 'b', text: 'other' }], required: ['a'] });
  assert.deepEqual(r.selected.map(x => x.id), ['a']); assert.equal(r.nativeToolsRemoved, false);
});
test('failure fingerprint counts unchanged retries and blocks destructive recommendation', async t => {
  const f = fixture(t); const input = { task: 'fix', action: 'request', error: 'timeout', candidates: [{ id: 'a', text: 'delete all', destructive: true }] };
  await f.call('recover', input); await f.call('recover', input); const r = await f.call('recover', input);
  assert.equal(r.attempts, 3); assert.equal(r.selected.length, 0); assert.equal(r.automaticExecution, false);
});
test('quality and translation judge cannot declare completion on fallback', async t => {
  const f = fixture(t); f.pilot.key = null; const r = await f.call('quality', { content: 'claim', rules: [{ id: 'a', text: 'needs proof' }], translations: [{ id: 'zh', text: '声明' }] }); assert.equal(r.verdict, 'needs_review');
});
test('real subprocess receipts fail after source mutation', async t => {
  const f = fixture(t); writeFileSync(join(f.root, 'code.txt'), 'v1');
  const r = await f.call('run_checks', { checks: [{ id: 'check', command: process.execPath, args: ['-e', 'process.stdout.write("ok")'] }], files: ['code.txt'] });
  assert.equal(r.results[0].status, 'passed'); writeFileSync(join(f.root, 'code.txt'), 'v2');
  const v = await f.call('verify_completion', { requirements: [{ id: 'r', text: 'works' }], receiptIds: [r.results[0].id] }); assert.equal(v.verdict, 'needs_review'); assert.equal(v.receipts[0].current, false);
});
test('failed subprocess receipt cannot support completion', async t => {
  const f = fixture(t); const r = await f.call('run_checks', { checks: [{ id: 'bad', command: process.execPath, args: ['-e', 'process.exit(7)'] }] });
  assert.equal(r.results[0].exitCode, 7); assert.equal(r.results[0].status, 'failed');
  const previous = process.env.TYPESAFE_API_KEY; process.env.TYPESAFE_API_KEY = 'fixture-private';
  try {
    const privateCheck = await f.call('run_checks', { checks: [{ id: 'private', command: process.execPath, args: ['-e', 'process.exit(process.env.TYPESAFE_API_KEY ? 8 : 0)'] }] });
    assert.equal(privateCheck.results[0].status, 'passed');
  } finally { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous; }
});
test('memory opt-in, conflict handling, source invalidation and scoped forgetting', async t => {
  const f = fixture(t); await assert.rejects(f.call('memory', { action: 'retrieve', goal: 'task' }), /MEMORY_DISABLED/);
  await f.call('configure', { memory: true }); writeFileSync(join(f.root, 'proof.txt'), 'proof');
  const first = await f.call('memory', { action: 'save', topic: 'rule', content: 'A', source: { path: 'proof.txt' } });
  const next = await f.call('memory', { action: 'save', topic: 'rule', content: 'B', source: { path: 'proof.txt' } }); assert.deepEqual(next.conflicts, [first.id]);
  await f.call('memory', { action: 'forget', id: first.id }); writeFileSync(join(f.root, 'proof.txt'), 'changed');
  assert.equal((await f.call('memory', { action: 'retrieve', goal: 'task' })).memories.length, 0);
});
test('compaction protects constraints, recent and side effects; omits complete read-only pairs', async t => {
  const f = fixture(t, () => 'exclude');
  const blocks = [{ id: 's', role: 'system', content: 'constraint' }, { id: 'a', role: 'tool_call', callId: 'x', content: 'read old', readOnly: true, verified: true }, { id: 'b', role: 'tool_result', callId: 'x', content: 'old data' }, { id: 'c', role: 'tool_call', callId: 'y', content: 'write', verified: true }, { id: 'd', role: 'tool_result', callId: 'y', content: 'done' }, { id: 'u', role: 'user', content: 'latest' }];
  const r = await f.call('compact', { goal: 'new task', blocks, preserveRecent: 1 }); assert.deepEqual(r.omittedCallIds, ['x']); assert.equal(r.nativeHistoryChanged, false); assert.deepEqual(r.blocks.map(b => b.id), ['s', 'c', 'd', 'u']);
  const next = await f.call('compact', { goal: 'new task', blocks, preserveRecent: 1 }); assert.equal(next.reusedJudgments, 1);
  assert.equal((await f.call('recall', { artifactId: r.originalId })).items.length, 6);
});
test('required and changed tests always run despite defer recommendation', async t => {
  const f = fixture(t, q => Object.hasOwn(q.criteria, 'defer') ? 'defer' : 'routine');
  const r = await f.call('review', { goal: 'fix', changes: [{ id: 'c', text: 'diff' }], tests: [{ id: 'a', text: 'required' }, { id: 'b', text: 'changed', changed: true }, { id: 'c', text: 'optional' }], required: ['a'] }); assert.deepEqual(r.run, ['a', 'b']); assert.deepEqual(r.deferred, ['c']);
});
test('checkpoint resume detects stale files and never replays side effects', async t => {
  const f = fixture(t); writeFileSync(join(f.root, 'a'), 'one'); const c = await f.call('checkpoint', { action: 'save', task: 'task', files: ['a'], completed: ['publish'] });
  writeFileSync(join(f.root, 'a'), 'two'); const r = await f.call('checkpoint', { action: 'resume', id: c.id }); assert.deepEqual(r.changedFiles, ['a']); assert.equal(r.automaticReplay, false);
});
test('vendored extraction returns verified exact source offsets', async t => {
  const f = fixture(t, (q, s) => { if (s.tokens) return '0'; return null; });
  const r = await f.call('extract', { content: 'Alice', fields: [{ id: 'name', description: 'Person name' }] }); assert.equal(r.fields.name.value, 'Alice'); assert.equal(r.fields.name.start, 0); assert.equal(r.fields.name.end, 5);
});
test('browser rejects stale observations, repeated execution and changed page', async t => {
  const f = fixture(t); const input = { driver: 'chrome', session: 's', goal: 'open', snapshot: 'page1', observedAt: Date.now(), candidates: [{ id: 'a', text: 'click button', target: 'button' }] };
  await assert.rejects(f.call('browser_step', { ...input, observedAt: Date.now() - 40000 }), /STALE_OBSERVATION/);
  const r = await f.call('browser_step', input);
  await assert.rejects(f.call('browser_consume', { driver: 'chrome', ticket: r.ticket, snapshot: 'page2' }), /STALE_OBSERVATION/);
  await f.call('browser_consume', { driver: 'chrome', ticket: r.ticket, snapshot: 'page1' });
  await assert.rejects(f.call('browser_consume', { driver: 'chrome', ticket: r.ticket, snapshot: 'page1' }), /INVALID_BROWSER_TICKET/);
  assert.equal((await f.call('browser_step', input)).reason, 'unchanged_action_loop');
});
test('browser driver loop verifies final observed state, not action success', async t => {
  const f = fixture(t); let clicked = false;
  const driver = { kind: 'computer-use', observe: async () => ({ snapshot: clicked ? 'done' : 'button', observedAt: Date.now(), candidates: [{ id: 'a', text: 'click' }] }), execute: async () => { clicked = true; }, verify: async (_, o) => ({ passed: o.snapshot === 'done', evidence: o.snapshot === 'done' ? { visible: 'done' } : null }) };
  assert.equal((await runBrowserLoop(f.ctx, { driver, goal: 'done', session: 's', maxSteps: 1 })).status, 'verified');
});
test('configuration is bounded and unknown settings fail closed', async t => {
  const f = fixture(t); await assert.rejects(f.call('configure', { timeoutMs: -1 })); await assert.rejects(f.call('configure', { apiKey: 'bad' }));
});
test('cancelled check stops its process and never starts the next command', {timeout:4000}, async t => {
  const f=fixture(t), controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),80);t.after(()=>clearTimeout(timer));
  const result=await f.pilot.call({workspace:f.root,operation:'run_checks',input:{checks:[
    {id:'slow',command:process.execPath,args:['-e','setTimeout(()=>{},10000)']},
    {id:'forbidden',command:process.execPath,args:['-e',"require('fs').writeFileSync('should-not-run','bad')"]}
  ]}},{signal:controller.signal});
  assert.equal(result.results.length,1);assert.equal(result.results[0].status,'cancelled');assert.equal(existsSync(join(f.root,'should-not-run')),false);
  await assert.rejects(f.pilot.call({workspace:f.root,operation:'run_checks',input:{checks:[{id:'x',command:process.execPath}]}},{signal:controller.signal}),/CANCELLED/);
});
test('compaction preserves non-English failures and unfinished status', async t => {
  const f=fixture(t,()=> 'exclude');
  for(const status of ['failed','cancelled','in_progress','unknown']) {
    const blocks=[{id:'a',role:'tool_call',callId:'x',content:'读取',verified:true,readOnly:true},{id:'b',role:'tool_result',callId:'x',content:'没有找到数据',status},{id:'u',role:'user',content:'继续'}];
    const result=await f.call('compact',{goal:'继续',blocks,preserveRecent:1,session:status});
    assert.deepEqual(result.blocks,blocks);assert.deepEqual(result.omittedCallIds,[]);
  }
});
