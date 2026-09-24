// The text-only consumer must receive the coverage and recovery contract too.
// Counts describe selection mechanics, never a proof of semantic correctness.
export function evidenceHandoff(result) {
  const c = result.coverage;
  if (!c || typeof result.context !== 'string') return result.context;
  const state = result.degraded ? 'degraded' : result.completeCoverage ? 'no budget-deferred records' : 'incomplete';
  const omitted = c.excluded + c.deferred + c.duplicates;
  return `JevPilot evidence: ${c.retained}/${c.total} records retained; ${c.excluded} judged unrelated, ${c.deferred} budget-deferred, ${c.duplicates} duplicates/already read; ${state}.\n`
    + (omitted || result.degraded ? 'Relevance judgments can be wrong; this is not proof that all relevant evidence is present. ' : '')
    + `Use retained evidence first. For a concrete gap or contradiction, recall by IDs or a literal query; full recall remains available when required. artifactId=${result.artifactId}.\n`
    + result.context;
}
