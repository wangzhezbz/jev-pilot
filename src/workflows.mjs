import { records, array, text, requireValue, readSource, hash, now } from './core.mjs';
import { extractSpans } from '../vendor/jeveryword/extract.mjs';

export async function decide(ctx, { items, question, choices }) {
  records(items); text(question, 10000); requireValue(choices && Object.keys(choices).length >= 2 && Object.keys(choices).length <= 255);
  return { decisions: await ctx.judge.classify(items, question, choices), fallbackOwner: 'Codex' };
}
export async function selectTools(ctx, { goal, tools, required = [] }) {
  records(tools, 255); array(required, 255); requireValue(required.every(id => tools.some(t => t.id === id)), 'UNKNOWN_REQUIRED_TOOL');
  const judgments = await ctx.judge.classify(tools, `Task: ${text(goal, 10000)}. Is this tool or skill useful for the next step?`, { use: 'Useful capability.', review: 'Potentially useful or uncertain.', skip: 'Clearly unrelated.' }, 'tool_selection');
  const selected = tools.filter((t, i) => required.includes(t.id) || judgments[i].choice !== 'skip');
  return { selected, judgments, nativeToolsRemoved: false, recoverableCandidates: tools.map(t => t.id) };
}
export async function recoverFailure(ctx, { task, action, error, state = {}, candidates }) {
  text(task, 10000); text(action, 5000); text(error, 15000); records(candidates, 30);
  const fingerprint = hash({ action, error, state }), previous = ctx.store.get(ctx.project, 'failure', fingerprint);
  const attempts = (previous?.attempts || 0) + 1;
  ctx.store.put(ctx.project, 'failure', { attempts, action, error, state, at: now() }, fingerprint);
  const judgments = await ctx.judge.classify(candidates, `Task: ${task}. Failed action: ${action}. Error: ${error}. Same failure observed ${attempts} times. Choose only a bounded recovery justified by the observed error; never weaken permissions or repeat unchanged failing actions.`, { use: 'Addresses observed cause.', review: 'Needs more evidence.', skip: 'Unrelated or repeats the same failure.' }, 'failure');
  const selected = candidates.filter((c, i) => judgments[i].choice === 'use' && c.text !== action && !c.destructive);
  return { fingerprint, attempts, stopUnchangedRetry: true, selected, judgments, automaticExecution: false, escalationRequired: attempts >= 3 || !selected.length };
}
export async function quality(ctx, { content, rules, translations = [] }) {
  text(content); records(rules, 64); records(translations, 8);
  const checks = await ctx.judge.classify(rules, `Check content against this rule. Content: ${content}`, { pass: 'Rule satisfied.', fail: 'Specific violation.', review: 'Cannot establish compliance.' }, 'quality');
  const languages = await ctx.judge.classify(translations, `Compare meaning, numbers, constraints and product claims with this source: ${content}. Do not reward literal phrasing over natural translation.`, { pass: 'Meaning and claims preserved.', fail: 'Meaning, numbers or constraints changed.', review: 'Uncertain.' }, 'translation');
  return { checks, translations: languages, verdict: [...checks, ...languages].length && [...checks, ...languages].every(x => x.choice === 'pass' && x.source === 'jev') ? 'passed' : 'needs_review' };
}
export async function reviewChanges(ctx, { goal, changes, tests, required = [] }) {
  records(changes, 100); records(tests, 100); array(required, 100);
  requireValue(required.every(id => tests.some(t => t.id === id)), 'UNKNOWN_REQUIRED_TEST');
  const risks = await ctx.judge.classify(changes, `Review change for task: ${text(goal, 10000)}. Flag concrete correctness, security, compatibility or data-loss concerns. This is triage, not final code review.`, { inspect: 'Potential defect warrants Codex review.', routine: 'No obvious concern in this excerpt.', review: 'Insufficient context.' }, 'review');
  const judgments = await ctx.judge.classify(tests, `Which tests cover these changes? ${JSON.stringify(changes)}. Never skip an uncertain test.`, { run: 'Relevant or changed test.', review: 'Uncertain dependency; run.', defer: 'Clearly unrelated optional test.' }, 'test_priority');
  return { risks, run: tests.filter((t, i) => t.required || t.changed || required.includes(t.id) || judgments[i].choice !== 'defer').map(t => t.id), deferred: tests.filter((t, i) => !t.required && !t.changed && !required.includes(t.id) && judgments[i].choice === 'defer').map(t => t.id), judgments, finalReviewOwner: 'Codex' };
}
const snapshot = (ctx, files) => Object.fromEntries(array(files, 100).map(p => [p, readSource(ctx.root, p).hash]));
export async function memory(ctx, input) {
  requireValue(ctx.config.memory === true, 'MEMORY_DISABLED');
  if (input.action === 'save') {
    text(input.content, 10000); text(input.topic, 256); requireValue(input.source && typeof input.source === 'object', 'SOURCE_REQUIRED');
    const source = input.source.path ? { ...readSource(ctx.root, input.source.path), text: undefined } : { receiptId: input.source.receiptId };
    if (!input.source.path) requireValue(ctx.store.get(ctx.project, 'receipt', source.receiptId)?.status === 'passed', 'SOURCE_REQUIRED');
    const ttlDays = input.ttlDays ?? 30; requireValue(Number.isFinite(ttlDays) && ttlDays >= 1 && ttlDays <= 365);
    const id = ctx.store.put(ctx.project, 'memory', { content: input.content, topic: input.topic, source, createdAt: now(), expiresAt: Date.now() + ttlDays * 86400000 });
    return { id, conflicts: ctx.store.list(ctx.project, 'memory').filter(m => m.id !== id && m.topic === input.topic && m.content !== input.content).map(m => m.id) };
  }
  if (input.action === 'forget') { const m = ctx.store.get(ctx.project, 'memory', input.id); requireValue(m, 'MEMORY_NOT_FOUND'); ctx.store.put(ctx.project, 'memory', { ...m, revoked: true }, input.id); return { revoked: input.id }; }
  requireValue(input.action === 'retrieve'); text(input.goal, 10000);
  const all = ctx.store.list(ctx.project, 'memory');
  const active = all.filter(m => !m.revoked && m.expiresAt > Date.now() && (() => {
    try {
      if (m.source.path) return readSource(ctx.root, m.source.path).hash === m.source.hash;
      const receipt = ctx.store.get(ctx.project, 'receipt', m.source.receiptId);
      return receipt?.status === 'passed' && Object.entries(receipt.sourceHashes || {}).every(([p, h]) => readSource(ctx.root, p).hash === h);
    } catch { return false; }
  })());
  const judgments = await ctx.judge.classify(active.slice(0, 100).map((m, i) => ({ id: 'm' + i, text: m.content })), `Relevance to task: ${input.goal}`, { use: 'Relevant project experience.', review: 'Uncertain relevance.', skip: 'Unrelated.' }, 'memory');
  return { memories: active.slice(0, 100).filter((m, i) => judgments[i].choice !== 'skip'), skippedStaleOrRevoked: all.length - active.length, truncated: active.length > 100, judgments, conflictsRequireReview: true };
}
export function checkpoint(ctx, input) {
  if (input.action === 'save') {
    text(input.task, 10000); array(input.completed || [], 100); array(input.pending || [], 100);
    const value = { task: input.task, completed: input.completed || [], pending: input.pending || [], sourceHashes: snapshot(ctx, input.files || []), createdAt: now(), receiptIds: input.receiptIds || [] };
    return { id: ctx.store.put(ctx.project, 'checkpoint', value) };
  }
  requireValue(input.action === 'resume'); const saved = ctx.store.get(ctx.project, 'checkpoint', input.id); requireValue(saved, 'CHECKPOINT_NOT_FOUND');
  const changes = Object.entries(saved.sourceHashes).filter(([p, h]) => { try { return readSource(ctx.root, p).hash !== h; } catch { return true; } }).map(([p]) => p);
  return { ...saved, changedFiles: changes, state: changes.length ? 'revalidate' : 'ready_for_review', automaticReplay: false, instruction: 'Inspect current state and receipts; never replay completed side effects blindly.' };
}
export async function extract(ctx, { content, path, fields }) {
  const source = path ? readSource(ctx.root, path) : { text: text(content, 20000), path: 'provided' };
  const sourceHash = hash(source.text); const artifactId = ctx.store.put(ctx.project, 'artifact', { items: [{ id: 'source', text: source.text, sourceHash, source: source.path }] });
  const result = await extractSpans({ text: source.text, fields, evaluate: ({ state, questions }) => ctx.judge.ask(state, questions, 'extraction') });
  for (const value of Object.values(result.results)) if (value.status === 'extracted') requireValue(source.text.slice(value.start, value.end) === value.value, 'SPAN_MISMATCH');
  return { fields: result.results, sourceHash, artifactId, source: source.path, sourceOffsets: 'UTF-16 code units, end exclusive', calls: result.calls, elapsedMs: result.durationMs };
}
export function metrics(ctx) {
  const events = ctx.store.events(ctx.project, 10000), calls = events.filter(e => e.kind === 'jev_call');
  const sum = key => calls.reduce((s, e) => s + (e[key] || 0), 0);
  return { events: events.length, windowLimit: 10000, jev: { calls: calls.length, failures: calls.filter(c => c.status === 'failed').length, inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), totalElapsedMs: sum('elapsedMs'), missingUsage: calls.filter(c => c.status === 'success' && c.inputTokens === null).length }, cacheHits: events.filter(e => e.kind === 'cache_hit').length, savings: null, savingsReason: 'Requires matched baseline tasks with quality acceptance and provider usage. No counterfactual savings inferred.' };
}
