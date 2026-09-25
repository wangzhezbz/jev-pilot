import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { records, array, text, requireValue, readSource, byteBudget, hash, now, classificationPlan } from './core.mjs';
import { protectedEvidence, exclusionDecision, EVIDENCE_POLICY } from './policy.mjs';
import { projectEvidence } from './evidence-projection.mjs';
const exec = promisify(execFile);
const relevant = {
  keep: 'Matches the task inclusion conditions, or contains necessary supporting context, a competing explanation, contradictory observation, or unresolved uncertainty needed to answer the task.',
  review: 'The relationship to the requested subject is genuinely ambiguous; retain for inspection.',
  exclude: 'Clearly fails the task inclusion conditions, or contains only an unrelated subject or routine observations with no facts needed for the answer. A source ID, timestamp, or generic shared word alone is not a relevant fact.',
};
const terms = s => new Set(s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []);
export function chunks(source, linesPerChunk = 30) {
  const lines = source.text.split('\n'), out = [];
  const add=(start,end,pin=false)=>out.push({id:'s'+start,text:lines.slice(start,end).join('\n'),source:source.path,startLine:start+1,endLine:end,sourceHash:source.hash,...(pin?{pin:true}:{})});
  // Keep Markdown records intact. Ignore headings inside fenced code and keep
  // shared preambles pinned; nested subsections belong to their parent record.
  let fence=null;const headings=[];
  for(const [i,line] of lines.entries()){
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;continue;}
    if(fence)continue;const heading=line.match(/^ {0,3}(#{1,6})\s+\S/);
    if(heading)headings.push({line:i,level:heading[1].length});
  }
  const level=[...new Set(headings.map(h=>h.level))].sort().find(n=>{
    const peers=headings.filter(h=>h.level===n);
    return peers.length>=4&&!headings.some(h=>h.level<n&&h.line>peers[0].line);
  });
  const starts=headings.filter(h=>h.level===level).map(h=>h.line);
  if(!fence&&starts.length>=4&&starts.length+(starts[0]>0?1:0)<=512){
    if(starts[0]>0)add(0,starts[0],true);
    starts.forEach((start,i)=>add(start,starts[i+1]??lines.length));
  }else{
    // Timestamped or line-numbered logs have explicit event starts. Keep any
    // continuation lines with their event and bound the number of groups, so
    // one failure does not protect thirty unrelated neighboring observations.
    const events=lines.flatMap((line,i)=>/^(?:L\d{3,}\b|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}|\[\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/.test(line)?[i]:[]);
    if(events.length>=12&&events.length>=lines.filter(x=>x.trim()).length*.8){
      if(events[0]>0)add(0,events[0],true);
      const group=Math.ceil(events.length/120);
      for(let i=0;i<events.length;i+=group)add(events[i],events[i+group]??lines.length);
    }else for (let i = 0; i < lines.length; i += linesPerChunk) add(i,Math.min(i+linesPerChunk,lines.length));
  }
  return out;
}
// Relevance/diversity selection; uncertain evidence is never discarded.
export async function selectEvidence(ctx, { goal, items, budget = 16000, against = [], requireCompleteJudgment = false }) {
  text(goal, 10000); records(items); array(against); requireValue(Number.isInteger(budget) && budget >= 128 && budget <= 500000, 'INVALID_BUDGET');
  const artifactId = ctx.store.put(ctx.project, 'artifact', { goal, items, createdAt: now() });
  const selected = [], excluded = [], deferred = [], duplicates = [], seen = new Set(), previouslyRead = new Set(against.map(hash));
  const unique = [];
  for (const item of items) {
    // Same body at a different source, line, time or status is a distinct
    // observation. A text-only `against` entry cannot establish its identity.
    const {id: candidateId, ...identity} = item;
    const key = hash(identity), plainText = Object.keys(identity).every(k => k === 'text');
    if ((seen.has(key) || plainText && previouslyRead.has(hash(item.text))) && !protectedEvidence(item)) { duplicates.push(item.id); continue; }
    seen.add(key); unique.push(item);
  }
  const judged = unique.filter(item => !protectedEvidence(item));
  const instructions=`Task: ${goal}\nSelect source evidence by its factual content. The task describes the final deliverable, not a request to retain every source identifier. Does this item itself contain evidence needed for that task? Never exclude a relevant contradiction or uncertainty merely because it complicates the answer.`;
  // Relevance decisions are independent; shared workflow classifications retain their original profile.
  ctx.judge.isolateItems=true;
  if(requireCompleteJudgment){
    const plan=ctx.judge.classificationWork?ctx.judge.classificationWork(judged,instructions,relevant):classificationPlan(ctx.config.model,judged,instructions,relevant,{},true);
    const reason=ctx.judge.classificationAdmission?ctx.judge.classificationAdmission(plan,instructions,relevant).reason:
      plan.oversized.length?'REQUEST_LIMIT':plan.batches.length>ctx.judge.config.maxCalls-ctx.judge.calls?'CALL_BUDGET':null;
    if(reason){ctx.store.event(ctx.project,'evidence_admission',{reason,batches:plan.batches.length,oversizedItems:plan.oversized.length,calls:0});throw Object.assign(new Error(reason),{code:reason});}
  }
  // Independent evidence batches share no answers. Use the existing bounded
  // worker pool instead of waiting for each network round trip in sequence.
  ctx.judge.concurrency = 2;
  const answers = await ctx.judge.classify(judged, instructions, relevant, 'evidence');
  const byId = new Map(answers.map(answer => [answer.id, answer]));
  const judgments = unique.map(item => byId.get(item.id) || { id: item.id, choice: 'keep', source: 'deterministic', reason: 'protected_evidence' });
  const candidates = [];
  const proposals = [];
  unique.forEach((item, i) => {
    const j = judgments[i], protectedItem = protectedEvidence(item), decision = exclusionDecision(j, ctx.config);
    if (decision.proposed && !protectedItem) proposals.push(item.id);
    if (decision.apply && !protectedItem) excluded.push(item.id);
    else candidates.push({ ...item, judgment: j, protected: protectedItem || j.choice !== 'keep' || j.source === 'fallback' });
  });
  let used = 0;
  const render = x => `[${x.id} ${x.source || 'provided'}${x.startLine ? ':' + x.startLine : ''}]\n${x.text}\n`;
  const add = x => { const rendered = render(x); selected.push(x); used += byteBudget(rendered); };
  // Full coverage needs no relevance ranking. Keep the source sequence and
  // avoid repeated tokenization/comparison of every surviving candidate.
  if(candidates.reduce((sum,c)=>sum+byteBudget(render(c)),0)<=budget){
    for(const c of candidates)add(c);
  }else{
    for(const c of candidates.filter(x=>x.protected))add(c);
    const sets=new Map(candidates.map(c=>[c.id,terms(c.text)]));
    const overlap=(a,b)=>{const x=sets.get(a.id),y=sets.get(b.id);if(!x.size||!y.size)return 0;let n=0;for(const w of x)if(y.has(w))n++;return n/(x.size+y.size-n);};
    const pool=candidates.filter(x=>!x.protected);
    const novelty=new Map(pool.map(c=>[c.id,Math.max(0,...selected.map(s=>overlap(c,s)))]));
    const sizes=new Map(pool.map(c=>[c.id,Math.sqrt(Math.max(1,byteBudget(render(c))))]));
    while(pool.length){
      const score=c=>(c.judgment.probabilities?.keep??.5)*(1-.6*novelty.get(c.id))/sizes.get(c.id);
      pool.sort((a,b)=>score(b)-score(a));const c=pool.shift();
      if(used+byteBudget(render(c))<=budget){add(c);for(const next of pool)novelty.set(next.id,Math.max(novelty.get(next.id),overlap(next,c)));}
      else deferred.push(c.id);
    }
  }
  ctx.store.event(ctx.project, 'evidence_selection', { policy: EVIDENCE_POLICY, candidates: items.length, judged: judged.length, duplicates: duplicates.length, proposedExclusions: proposals.length, appliedExclusions: excluded.length, mode: ctx.config?.evidenceMode || 'active' });
  return { artifactId, context: selected.map(render).join(''), items: selected, excludedIds: excluded, proposedExcludedIds: proposals, policy: EVIDENCE_POLICY, deferredIds: deferred, duplicateIds: duplicates,
    budget, usedBytes: used, budgetUnit: 'UTF-8 bytes; conservative token bound, not measured tokens', protectedOverflow: used > budget,
    completeCoverage: deferred.length === 0, coverage: {total:items.length,retained:selected.length,excluded:excluded.length,deferred:deferred.length,duplicates:duplicates.length}, recovery: { operation: 'recall', artifactId }, degraded: judgments.some(j => j.source === 'fallback') };
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
  return selectEvidence(ctx, { goal: input.goal, items: chunks(source), budget: input.budget, against: input.against, requireCompleteJudgment: input.requireCompleteJudgment });
}
export function recall(ctx, { artifactId, ids, query, offset = 0, limit = 20 }) {
  const artifact = ctx.store.get(ctx.project, 'artifact', artifactId); requireValue(artifact, 'ARTIFACT_NOT_FOUND');
  if (query !== undefined) {
    text(query, 1000); requireValue(query.trim().length > 0 && ids === undefined, 'ONE_RECALL_SELECTOR_REQUIRED');
    requireValue(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_RECALL_PAGE');
    const needle = query.toLocaleLowerCase('en-US');
    const matches = artifact.items.filter(item => [item.id,item.source,item.text].some(value => typeof value === 'string' && value.toLocaleLowerCase('en-US').includes(needle)));
    const items = matches.slice(offset, offset + limit), nextOffset = offset + items.length < matches.length ? offset + items.length : null;
    return {artifactId,items,original:true,query,matchedItems:matches.length,offset,nextOffset,complete:nextOffset===null,scope:'Literal match in this saved artifact only; no match does not prove semantic absence.'};
  }
  if (ids) array(ids); const items = ids ? artifact.items.filter(x => ids.includes(x.id)) : artifact.items;
  return { artifactId, items, original: true, missingIds: (ids || []).filter(id => !items.some(x => x.id === id)) };
}
// Keep complete exchanges and protected instructions. This prepares a handoff, not an API history rewrite.
export async function compactContext(ctx, { goal, blocks, session = 'default', preserveRecent = 6 }) {
  text(goal, 10000); text(session, 256);
  array(blocks, 512); requireValue(Number.isInteger(preserveRecent) && preserveRecent >= 1 && preserveRecent <= 50);
  const ids = new Set(); for (const b of blocks) { text(b.id, 128); text(b.content); requireValue(!ids.has(b.id), 'DUPLICATE_ID'); ids.add(b.id); }
  const originalId = ctx.store.put(ctx.project, 'artifact', { items: blocks.map(b => ({ ...b, text: b.content })), goal });
  const positions = new Map(blocks.map((b, i) => [b.id, i]));
  const pairs = new Map(); blocks.forEach(b => { if (b.callId) { const group = pairs.get(b.callId) || []; group.push(b); pairs.set(b.callId, group); } });
  const eligible = [...pairs].filter(([, group]) => group.length === 2 && group.some(b => b.role === 'tool_call' && b.readOnly === true && b.verified === true)
    && group.some(b => b.role === 'tool_result') && group.every(b => !protectedEvidence(b, { paths: true }) && (!b.status || ['completed', 'success', 'succeeded', 'passed'].includes(b.status)) && b.verified !== false && positions.get(b.id) < blocks.length - preserveRecent));
  // Position controls eligibility, not the meaning of an unchanged exchange.
  // Keep content, order within the exchange and all caller metadata in the identity.
  const cacheId = hash({ session, goal, model: ctx.config.model, policy: EVIDENCE_POLICY, cache: 'exchange-v2' });
  const previous = ctx.store.get(ctx.project, 'compaction', cacheId) || { decisions: {} };
  const canReuse = ctx.config.enabled && ctx.judge.key && ctx.config.cacheMs > 0 && !ctx.judge.signal?.aborted;
  const fresh = ([id, group]) => {
    const saved = previous.decisions[id];
    return canReuse && saved?.hash === hash(group) && saved.expiresAt > Date.now()
      && saved.createdAt + ctx.config.cacheMs > Date.now();
  };
  const pending = eligible.filter(pair => !fresh(pair));
  // A failed reevaluation must never revive the previous exclusion.
  for (const [id] of pending) delete previous.decisions[id];
  const decisions = await ctx.judge.classify(pending.map(([id, group], i) => ({ id: 'p' + i, text: JSON.stringify(group) })), `Goal: ${goal}. Is this completed read-only tool exchange still useful?`, relevant, 'context');
  const failed = decisions.some(d => d.source === 'fallback');
  pending.forEach(([id, group], i) => { if (decisions[i].source === 'jev') previous.decisions[id] = { hash: hash(group), ...decisions[i], createdAt: Date.now(), expiresAt: Date.now() + ctx.config.cacheMs }; });
  const proposed = eligible.filter(([id]) => exclusionDecision(previous.decisions[id], ctx.config).proposed).map(([id]) => id);
  const remove = new Set(failed || ctx.config?.evidenceMode === 'shadow' ? [] : proposed);
  const retained = blocks.filter(b => !remove.has(b.callId)); ctx.store.put(ctx.project, 'compaction', previous, cacheId);
  const plainContext = retained.map(b => `[${b.role} ${b.id}]\n${b.content}`).join('\n\n');
  const eligibleIds = new Set(eligible.map(([id]) => id));
  const projection = projectEvidence(retained.map(b => ({ id:b.id, role:b.role, text:b.content,
    source: b.role === 'tool_result' && eligibleIds.has(b.callId) ? 'handoff.txt' : 'protected.raw' })),
    { fragments:true, header:b => `[${b.role} ${b.id}]\n` });
  // Retain all original blocks internally. Only the handoff presentation changes;
  // include metadata/decoder overhead in the benefit gate and never force it.
  const useProjection = ctx.config.enabled && ctx.config.evidenceMode !== 'shadow' && !ctx.judge.signal?.aborted &&
    projection.kind !== 'original' && byteBudget(projection.context) + 512 < byteBudget(plainContext) * .85;
  const context = useProjection ? projection.context : plainContext;
  ctx.store.event(ctx.project, 'context_compaction', { candidates: eligible.length, judged: pending.length, proposedExclusions: proposed.length, appliedExclusions: remove.size, degraded: failed, mode: ctx.config.evidenceMode, policy: EVIDENCE_POLICY });
  return { mode: 'recoverable_handoff', originalId, blocks: retained, omittedCallIds: [...remove], proposedOmittedCallIds: proposed, degraded: failed, policy: EVIDENCE_POLICY, reusedJudgments: eligible.length - pending.length,
    inputBytes: byteBudget(JSON.stringify(blocks)), outputBytes: byteBudget(JSON.stringify(retained)), nativeHistoryChanged: false,
    context, presentation: useProjection ? 'lossless_shared_prose' : 'original',
    presentationInputBytes: byteBudget(plainContext), presentationOutputBytes: byteBudget(context),
    recovery: { operation: 'recall', artifactId: originalId } };
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
