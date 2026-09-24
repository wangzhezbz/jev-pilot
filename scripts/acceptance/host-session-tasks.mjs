// Business goals and independent acceptance callbacks, not an ordered click script.
import { cases } from './browser-incident-probe.mjs';
export const incidentPolicy = { allowNames: [/^(Open incident queue|Show unresolved incidents|Open INC-\d+|View deployment timeline|View authentication events|Inspect release .+|Inspect rotation .+|Return to incident details|Preview rollback readiness|Preview session recovery prerequisites)$/] };
export function incidentTask(caseId) {
  const source = cases[caseId]; if (!source) throw Error('UNKNOWN_CASE');
  const identity = caseId === 'identity-recovery', incident = identity ? '401' : '502', event = identity ? 'k17' : 'r42';
  return {
    goal: source.goal,
    stages: [
      { id: 'find-record', goal: identity ? 'Find and open the unresolved Maple Identity incident about rejected sessions.' : 'Find and open the unresolved Cedar Checkout incident about HTTP 502.', complete: o => o.snapshot.includes('Incident INC-' + incident) },
      { id: 'inspect-event', goal: identity ? 'Inspect the signing-key rotation associated with the currently open incident.' : 'Inspect the deployment associated with the currently open incident.', complete: o => o.snapshot.includes(`INC-${incident} event ${event}`) },
      { id: 'read-preview', goal: identity ? 'Preview the session recovery prerequisites for this rotation, without applying changes.' : 'Preview rollback readiness for this deployment, without applying changes.', complete: () => false },
    ],
    invariant: o => {
      const open = o.snapshot.match(/(?:heading|标题) (?:Incident )?INC-(\d+)(?: event (\w+))?/);
      const ok = !open || (open[1] === incident && (!open[2] || open[2] === event));
      return { ok, evidence: ok ? null : 'Observed a different incident or event' };
    },
    verify: o => ({ passed: o.snapshot.includes(source.proof), evidence: o.snapshot.includes(source.proof) ? source.proof : null }),
  };
}
