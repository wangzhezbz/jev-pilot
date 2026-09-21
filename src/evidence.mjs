import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { records, array, text, requireValue, readSource, byteBudget, hash, now } from './core.mjs';
const exec = promisify(execFile);
const relevant = { keep: 'Relevant evidence including contradictions or unresolved errors.', review: 'Unclear; retain for Codex review.', exclude: 'Clearly unrelated or superseded evidence.' };
const terms = s => new Set(s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []);
const similarity = (a, b) => { const x = terms(a), y = terms(b); return x.size && y.size ? [...x].filter(w => y.has(w)).length / new Set([...x, ...y]).size : 0; };
export function chunks(source, linesPerChunk = 30) {
  const lines = source.text.split('\n'), out = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) out.push({ id: 's' + i, text: lines.slice(i, i + linesPerChunk).join('\n'), source: source.path, startLine: i + 1, endLine: Math.min(i + linesPerChunk, lines.length), sourceHash: source.hash });
  return out;
}
// Relevance/diversity selection; uncertain evidence is never discarded.
export async function selectEvidence(ctx, { goal, items, budget = 16000, against = [] }) {
  text(goal, 10000); records(items); array(against); requireValue(Number.isInteger(budget) && budget >= 128 && budget <= 500000, 'INVALID_BUDGET');
  const artifactId = ctx.store.put(ctx.project, 'artifact', { goal, items, createdAt: now() });
  const judgments = await ctx.judge.classify(items, `Task: ${goal}. Should this item be included as task evidence?`, relevant, 'evidence');
  const selected = [], excluded = [], deferred = [], duplicates = [], seen = new Set(against.map(hash));
  const candidates = [];
  items.forEach((item, i) => {
    const j = judgments[i]; const protectedItem = item.pin || /\b(error|failed|exception|traceback)\b/i.test(item.text);
    if (seen.has(hash(item.text)) && !protectedItem) { duplicates.push(item.id); return; }
    seen.add(hash(item.text));
    if (j.choice === 'exclude' && !protectedItem) excluded.push(item.id);
    else candidates.push({ ...item, judgment: j, protected: protectedItem || j.choice === 'review' || j.source === 'fallback' });
  });
  let used = 0;
  const render = x => `[${x.id} ${x.source || 'provided'}${x.startLine ? ':' + x.startLine : ''}]\n${x.text}\n`;
  const add = x => { const rendered = render(x); selected.push(x); used += byteBudget(rendered); };
  for (const c of candidates.filter(x => x.protected)) add(c);
  let pool = candidates.filter(x => !x.protected);
  while (pool.length) {
    pool.sort((a, b) => {
      const score = c => (c.judgment.probabilities?.keep ?? .5) * (1 - .6 * Math.max(0, ...selected.map(s => similarity(c.text, s.text)))) / Math.sqrt(Math.max(1, byteBudget(render(c))));
      return score(b) - score(a);
    });
    const c = pool.shift(); if (used + byteBudget(render(c)) <= budget) add(c); else deferred.push(c.id);
  }
  return { artifactId, context: selected.map(render).join(''), items: selected, excludedIds: excluded, deferredIds: deferred, duplicateIds: duplicates,
    budget, usedBytes: used, budgetUnit: 'UTF-8 bytes; conservative token bound, not measured tokens', protectedOverflow: used > budget,
    completeCoverage: deferred.length === 0, recovery: { operation: 'recall', artifactId }, degraded: judgments.some(j => j.source === 'fallback') };
}
export async function search(ctx, { goal, query, maxMatches = 100, budget, paths = ['.'] }) {
  text(query, 1000); requireValue(query.length > 0); requireValue(Number.isInteger(maxMatches) && maxMatches > 0 && maxMatches <= 400);
  for (const path of array(paths, 20)) { text(path, 1000); requireValue(!path.startsWith('-') && !relative(ctx.root, resolve(ctx.root, path)).startsWith('..'), 'OUTSIDE_WORKSPACE'); }
  let stdout = '', truncated = false;
  try { ({ stdout } = await exec('rg', ['--json', '--fixed-strings', '--max-count', String(maxMatches + 1), '--max-filesize', '1M', '--', query, ...paths], { cwd: ctx.root, maxBuffer: 8 * 1024 * 1024, timeout: 10000 })); }
  catch (e) { if (e.code === 1) return { items: [], reason: 'no_literal_matches', completeCoverage: true }; throw Object.assign(new Error('SEARCH_FAILED'), { code: 'SEARCH_FAILED' }); }
  const matches = stdout.split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(x => x.type === 'match');
  truncated = matches.length > maxMatches; const items = [], skippedPaths = new Set();
  for (const match of matches.slice(0, maxMatches)) {
    const p = match.data.path.text;
    try {
      const source = readSource(ctx.root, p), start = Math.max(1, match.data.line_number - 3), end = match.data.line_number + 4;
      items.push({ id: 'r' + items.length, source: source.path, startLine: start, endLine: end, sourceHash: source.hash, text: source.text.split('\n').slice(start - 1, end).join('\n') });
    } catch { skippedPaths.add(p); }
  }
  const result = await selectEvidence(ctx, { goal, items, budget });
  return { ...result, candidateLimitReached: truncated, excludedPathCount: skippedPaths.size, completeCoverage: result.completeCoverage && !truncated && skippedPaths.size === 0, searchType: 'literal rg candidates followed by semantic filtering' };
}
export async function filterOutput(ctx, input) {
  let source;
  if (input.path) source = readSource(ctx.root, input.path);
  else { text(input.text); source = { path: input.source || 'tool-output', text: input.text, hash: hash(input.text) }; }
  return selectEvidence(ctx, { goal: input.goal, items: chunks(source), budget: input.budget, against: input.against });
}
export function recall(ctx, { artifactId, ids }) {
  const artifact = ctx.store.get(ctx.project, 'artifact', artifactId); requireValue(artifact, 'ARTIFACT_NOT_FOUND');
  if (ids) array(ids); const items = ids ? artifact.items.filter(x => ids.includes(x.id)) : artifact.items;
  return { artifactId, items, original: true, missingIds: (ids || []).filter(id => !items.some(x => x.id === id)) };
}
// Keep complete exchanges and protected instructions. This prepares a handoff, not an API history rewrite.
export async function compactContext(ctx, { goal, blocks, session = 'default', preserveRecent = 6 }) {
  text(goal, 10000); text(session, 256);
  array(blocks, 512); requireValue(Number.isInteger(preserveRecent) && preserveRecent >= 1 && preserveRecent <= 50);
  const ids = new Set(); for (const b of blocks) { text(b.id, 128); text(b.content); requireValue(!ids.has(b.id), 'DUPLICATE_ID'); ids.add(b.id); }
  const originalId = ctx.store.put(ctx.project, 'artifact', { items: blocks.map(b => ({ ...b, text: b.content })), goal });
  const pairs = new Map(); blocks.forEach((b, i) => { if (b.callId) { const group = pairs.get(b.callId) || []; group.push({ ...b, index: i }); pairs.set(b.callId, group); } });
  const eligible = [...pairs].filter(([, group]) => group.length === 2 && group.some(b => b.role === 'tool_call' && b.readOnly === true && b.verified === true)
    && group.some(b => b.role === 'tool_result') && group.every(b => !b.pin && !b.error && !b.failed && (!b.status || ['completed', 'success', 'succeeded', 'passed'].includes(b.status)) && b.verified !== false && b.index < blocks.length - preserveRecent && !/\b(error|failed|exception)\b/i.test(b.content)));
  const cacheId = hash({ session, goal, policy: 'protected-handoff-v1' }), previous = ctx.store.get(ctx.project, 'compaction', cacheId) || { decisions: {} };
  const pending = eligible.filter(([id, group]) => previous.decisions[id]?.hash !== hash(group));
  const decisions = await ctx.judge.classify(pending.map(([id, group], i) => ({ id: 'p' + i, text: JSON.stringify(group) })), `Goal: ${goal}. Is this completed read-only tool exchange still useful?`, relevant, 'context');
  pending.forEach(([id, group], i) => { previous.decisions[id] = { hash: hash(group), choice: decisions[i].choice, source: decisions[i].source }; });
  const remove = new Set(eligible.filter(([id]) => previous.decisions[id]?.choice === 'exclude' && previous.decisions[id]?.source === 'jev').map(([id]) => id));
  const retained = blocks.filter(b => !remove.has(b.callId)); ctx.store.put(ctx.project, 'compaction', previous, cacheId);
  return { mode: 'recoverable_handoff', originalId, blocks: retained, omittedCallIds: [...remove], reusedJudgments: eligible.length - pending.length,
    inputBytes: byteBudget(JSON.stringify(blocks)), outputBytes: byteBudget(JSON.stringify(retained)), nativeHistoryChanged: false,
    context: retained.map(b => `[${b.role} ${b.id}]\n${b.content}`).join('\n\n'), recovery: { operation: 'recall', artifactId: originalId } };
}

export async function runChecks(ctx, { checks, files = [] }) {
  array(checks, 20); array(files, 100); const results = [];
  const signal = ctx.judge.signal;
  const env = { ...process.env }; delete env.TYPESAFE_API_KEY;
  const snapshot = () => Object.fromEntries(files.map(p => { try { return [p, readSource(ctx.root, p).hash]; } catch { return [p, null]; } }));
  for (const check of checks) {
    requireValue(!signal?.aborted, 'CANCELLED');
    text(check.id, 128); text(check.command, 1000); array(check.args || [], 100).forEach(x => text(x, 10000));
    requireValue(check.timeoutMs === undefined || Number.isInteger(check.timeoutMs) && check.timeoutMs >= 100 && check.timeoutMs <= 120000, 'INVALID_TIMEOUT');
    const before = snapshot(); const start = performance.now(); let output = '', exitCode = null, status = 'failed';
    try { const r = await exec(check.command, check.args || [], { cwd: ctx.root, env, signal, timeout: Math.min(check.timeoutMs || 30000, 120000), maxBuffer: 2000000, windowsHide: true }); output = r.stdout + r.stderr; exitCode = 0; status = 'passed'; }
    catch (e) { output = (e.stdout || '') + (e.stderr || ''); exitCode = typeof e.code === 'number' ? e.code : null; status = signal?.aborted ? 'cancelled' : e.killed ? 'timeout' : 'failed'; }
    const after = snapshot(); if (JSON.stringify(before) !== JSON.stringify(after) || Object.values(after).includes(null)) status = 'stale';
    const artifactId = ctx.store.put(ctx.project, 'artifact', { items: [{ id: 'output', text: output }], command: check.command, args: check.args });
    const receipt = { id: randomUUID(), checkId: check.id, status, exitCode, artifactId, sourceHashes: after, at: now(), elapsedMs: Math.round(performance.now() - start), issuer: 'jev-pilot-check-runner' };
    ctx.store.put(ctx.project, 'receipt', receipt, receipt.id); ctx.store.event(ctx.project, 'check', { checkId: check.id, status, elapsedMs: receipt.elapsedMs }); results.push(receipt);
    if (signal?.aborted) break;
  } return { results };
}
export async function verifyCompletion(ctx, { requirements, receiptIds = [], claims = '' }) {
  records(requirements, 64); array(receiptIds, 100);
  const receipts = receiptIds.map(id => ctx.store.get(ctx.project, 'receipt', id)).filter(Boolean);
  const checked = receipts.map(r => ({ ...r, current: Object.entries(r.sourceHashes || {}).every(([p, h]) => { try { return readSource(ctx.root, p).hash === h; } catch { return false; } }) }));
  const evidence = checked.map(r => { const artifact = ctx.store.get(ctx.project, 'artifact', r.artifactId); return { ...r, command: artifact?.command, args: artifact?.args, outputExcerpt: artifact?.items?.[0]?.text?.slice(0, 3000) }; });
  const results = await ctx.judge.classify(requirements, `Do provided receipts and claims support this requirement? Receipts: ${JSON.stringify(evidence)}. Claims (not proof): ${text(claims, 10000)}.`, { supported: 'Direct current passing evidence covers this requirement.', missing: 'No direct evidence or requirement not met.', review: 'Ambiguous; Codex must inspect.' }, 'completion');
  const allCurrent = checked.length > 0 && checked.every(r => r.current && r.status === 'passed') && checked.length === receiptIds.length;
  return { requirements: results, receipts: checked, verdict: allCurrent && results.length > 0 && results.every(r => r.choice === 'supported' && r.source === 'jev') ? 'evidence_supported' : 'needs_review', finalAcceptanceOwner: 'Codex', missingReceiptIds: receiptIds.filter(id => !receipts.some(r => r.id === id)) };
}
