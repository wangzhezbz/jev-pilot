import { EVIDENCE_POLICY } from './policy.mjs';
export function diagnostics(ctx) {
  const events = ctx.store.events(ctx.project, 10000), count = values => Object.fromEntries([...new Set(values)].map(v => [v, values.filter(x => x === v).length]));
  const admissions = events.filter(e => e.kind === 'automatic_output_admission');
  const admittedIds = new Set(admissions.filter(e=>e.reason==='eligible'&&typeof e.boundaryId==='string').map(e=>e.boundaryId));
  const filters = events.filter(e=>e.kind==='automatic_output_filter');
  const matchedApplied = filters.filter(e=>typeof e.boundaryId==='string'&&admittedIds.has(e.boundaryId)).length;
  const evidence = events.filter(e => e.kind === 'evidence_selection' || e.kind === 'context_compaction');
  const sum = key => evidence.reduce((n, e) => n + (e[key] || 0), 0);
  const budgets = ctx.store.list(ctx.project, 'task_budget').filter(b => b.windowEndsAt > Date.now()).map(b => ({ scope: b.scope, calls: b.calls, bytes: b.bytes, elapsedMs: b.elapsedMs, pending: Object.keys(b.reservations).length, windowEndsAt: b.windowEndsAt }));
  return { eventWindow: { count: events.length, limit: 10000, oldest: events.at(-1)?.at ?? null },
    policy: { version: EVIDENCE_POLICY, mode: ctx.config.evidenceMode, excludeProbability: ctx.config.excludeProbability, thresholdCalibrated: false },
    skips: count(events.filter(e => e.kind === 'judgment_skipped').map(e => e.reason)),
    failures: count(events.filter(e => e.kind === 'jev_call' && e.status === 'failed').map(e => e.code)),
    outputAdmission: { observed: admissions.length, reasons: count(admissions.map(e => e.reason)), applied: filters.length,
      matchedApplied, unmatchedApplied: filters.length-matchedApplied, coverageRate: null },
    evidence: { candidates: sum('candidates'), judged: sum('judged'), duplicates: sum('duplicates'), proposedExclusions: sum('proposedExclusions'), appliedExclusions: sum('appliedExclusions') },
    budgets, cooldowns: ctx.store.list(ctx.project, 'circuit').filter(c => c.openUntil > Date.now()).map(c => ({ failures: c.failures, openUntil: c.openUntil })),
    latestEvaluation: ctx.store.list(ctx.project, 'policy_evaluation')[0] ?? null,
    coverageNote: 'Observed bridge text boundaries only; structured output and nested code-mode results are not automatically rewritten. Counts use the latest 10000 local events. Unmatched filters may be legacy or have admission records outside this window; no overall coverage rate is inferred.' };
}
