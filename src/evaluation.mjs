import { array, requireValue, hash, now } from './core.mjs';
import { EVIDENCE_POLICY } from './policy.mjs';

// Evaluate labeled exclusions; the held-out labels never choose the threshold.
// Caller-supplied labels remain evidence, not independently verified ground truth.
export function wilsonLower(correct, n) {
  if (!n) return 0;
  const z = 1.645, p = correct / n, zz = z * z;
  return (p + zz / (2 * n) - z * Math.sqrt(p * (1 - p) / n + zz / (4 * n * n))) / (1 + zz / n);
}
function score(rows, threshold) {
  const accepted = rows.filter(r => r.choice === 'exclude' && r.probability >= threshold);
  const correct = accepted.filter(r => r.gold === 'exclude').length;
  return { samples: rows.length, excluded: accepted.length, falseExclusions: accepted.length - correct,
    precision: accepted.length ? correct / accepted.length : null,
    coverage: rows.length ? accepted.length / rows.length : 0, lower95: wilsonLower(correct, accepted.length) };
}
export function evaluatePolicy(ctx, input) {
  const rows = array(input.rows, 5000), ids = new Set(), groups = new Map();
  for (const key of ['domain', 'model', 'rubricHash']) requireValue(typeof input[key] === 'string' && input[key].length > 0 && input[key].length <= 200);
  for (const r of rows) {
    requireValue(r && typeof r.id === 'string' && !ids.has(r.id), 'DUPLICATE_SAMPLE'); ids.add(r.id);
    requireValue(['fit', 'holdout'].includes(r.split) && typeof r.group === 'string' && r.group.length > 0, 'INVALID_SPLIT');
    requireValue(!groups.has(r.group) || groups.get(r.group) === r.split, 'HOLDOUT_LEAKAGE'); requireValue(!groups.has(r.group), 'DUPLICATE_GROUP'); groups.set(r.group, r.split);
    requireValue(['keep', 'review', 'exclude'].includes(r.gold) && ['keep', 'review', 'exclude'].includes(r.choice) && Number.isFinite(r.probability) && r.probability >= 0 && r.probability <= 1, 'INVALID_SAMPLE');
  }
  const fit = rows.filter(r => r.split === 'fit'), holdout = rows.filter(r => r.split === 'holdout');
  requireValue(fit.length && holdout.length, 'SPLIT_REQUIRED');
  const thresholds = [...new Set(fit.filter(r => r.choice === 'exclude').map(r => r.probability))].sort((a, b) => a - b);
  const threshold = thresholds.find(t => score(fit, t).lower95 >= .95) ?? null;
  const fitResult = score(fit, threshold ?? Infinity), holdoutResult = score(holdout, threshold ?? Infinity);
  const sufficient = fit.length >= 100 && holdout.length >= 100 && new Set(fit.map(r => r.gold)).size > 1 && new Set(holdout.map(r => r.gold)).size > 1;
  const report = { at: now(), policy: EVIDENCE_POLICY, domain: input.domain, model: input.model, rubricHash: input.rubricHash,
    datasetHash: hash(rows), labels: 'caller-supplied', threshold, fit: fitResult, holdout: holdoutResult,
    status: sufficient && threshold !== null && holdoutResult.lower95 >= .95 ? 'heldout-pass' : 'insufficient-or-failed',
    warnings: [...(!sufficient ? ['Need at least 100 labeled fit and 100 independent holdout samples with both relevant and irrelevant cases.'] : []), ...(threshold === null ? ['No fit threshold meets the one-sided 95% Wilson lower bound of 0.95.'] : [])],
    applied: false, limitation: 'Evaluation only. No automatic activation, no guarantee outside this labeled domain/model/rubric.' };
  const id = ctx.store.put(ctx.project, 'policy_evaluation', report); return { id, ...report };
}
