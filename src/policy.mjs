// Conservative initial policy, not a claim of calibrated task accuracy.
export const EVIDENCE_POLICY = 'preserve-uncertainty-v2';
export const DEFAULT_EXCLUDE_PROBABILITY = 0.9;
export function mayOmit(judgment, choice, config = {}) {
  return config.evidenceMode !== 'shadow' && judgment?.source === 'jev' && judgment.choice === choice
    && Number.isFinite(judgment.probabilities?.[choice]) && judgment.probabilities[choice] >= (config.excludeProbability ?? DEFAULT_EXCLUDE_PROBABILITY);
}
export function protectedEvidence(item, { paths = false } = {}) {
  const content = item.text ?? item.content ?? '';
  return Boolean(item.pin || item.error || item.failed ||
    /\b(error|failed|exception|traceback|TODO|FIXME|pending|unresolved)\b|未完成|待验证|待办|失败|异常|错误|未解决/i.test(content) ||
    paths && /(?:^|[\s"'`(])(?:\.?\.?\/|[A-Za-z]:\\|~\/)[^\s]+|\b[\w.-]+\.(?:mjs|js|ts|tsx|py|go|rs|json|toml|yaml|yml|md|sh|txt)\b/.test(content));
}
export function exclusionDecision(judgment, config = {}) {
  const threshold = config.excludeProbability ?? DEFAULT_EXCLUDE_PROBABILITY;
  const ps = judgment?.probabilities;
  const proposed = judgment?.source === 'jev' && judgment.choice === 'exclude' &&
    Number.isFinite(ps?.exclude) && ps.exclude >= threshold;
  return { proposed, apply: proposed && config.evidenceMode !== 'shadow', policy: EVIDENCE_POLICY, threshold };
}
