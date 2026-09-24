// Paid, bounded semantic probe. Synthetic reconstruction, NOT replay of missing original AX.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store, Judge, loadConfig, loadKey, transport } from '../../src/core.mjs';
import { installHome } from '../../src/setup.mjs';
import { browserStep } from '../../src/browser.mjs';
import { cases } from './browser-incident-probe.mjs';

if (!process.argv.includes('--run')) throw Error('EXPLICIT_RUN_REQUIRED');
const root = mkdtempSync(join(tmpdir(), 'jev-branch-diagnostic-'));
const out = resolve(process.argv.find(x => x.startsWith('--out='))?.slice(6) || 'dist/browser-branch-diagnostic');
mkdirSync(out, { recursive: true });
const store = new Store({ home: join(root, 'private') }), project = 'branch-probe';
const key = loadKey(installHome()); if (!key) throw Error('MISSING_KEY');
const config = { ...loadConfig(store, project), enabled: true, cacheMs: 0, maxCalls: 1, taskMaxCalls: 8, taskMaxWaitMs: 40000, timeoutMs: 5000 };
let calls = 0;
const rows = [];
const specimens = [
  { caseId: 'identity-recovery', note: 'Maple Identity returns 401 since signing-key rotation k17. Investigate session recovery prerequisites without resetting sessions.', narrow: 'Inspect the signing-key rotation associated with the currently open incident.', expected: 'auth' },
  { caseId: 'checkout-rollback', note: 'Cedar Checkout returns 502 since deployment r42. Investigate rollback readiness without applying rollback.', narrow: 'Inspect the deployment associated with the currently open incident.', expected: 'deploy' },
];
try {
  for (const specimen of specimens) for (const reverse of [false, true]) for (const narrow of reverse ? [true, false] : [false, true]) {
    const candidates = [{ id: 'deploy', text: 'View deployment timeline', target: 9 }, { id: 'auth', text: 'View authentication events', target: 10 }];
    if (reverse) candidates.reverse();
    const snapshot = `JevPilot synthetic incident review\n${specimen.note}\n9 button View deployment timeline\n10 button View authentication events\n11 button Restart production service`;
    const trace = {};
    const judge = new Judge({ store, project, config, key, taskId: 'branch-probe', send: async (...args) => {
      if (++calls > 8) throw Error('LIVE_CALL_LIMIT');
      trace.request = args[0];
      const result = await transport(...args); trace.response = result; return result;
    } });
    const start = performance.now();
    let result = null, error = null;
    try { result = await browserStep({ store, project, config, judge }, { driver: 'chrome', session: 'probe-' + rows.length, snapshot, goal: narrow ? specimen.narrow : cases[specimen.caseId].goal, observedAt: Date.now(), candidates }); }
    catch (e) { error = e.code || e.message; }
    rows.push({ caseId: specimen.caseId, goalMode: narrow ? 'subgoal' : 'whole_task', reversed: reverse, expected: specimen.expected, selected: result?.action?.id ?? null, status: result?.status ?? null, reason: result?.reason ?? null, passed: result?.action?.id === specimen.expected, error, elapsedMs: performance.now() - start, ...trace });
    writeFileSync(join(out, 'results.json'), JSON.stringify({ scope: 'Eight planned variants on synthetic branch reconstruction; calls records actual API sends, with admission skips excluded. Not exact failed AX replay, not UI execution, not GPT cost or speed comparison; no repetitions. Narrow subgoal supplied by Codex is not free production planning.', calls, rows }, null, 2));
  }
  writeFileSync(join(out, 'events.json'), JSON.stringify(store.events(project, 10000).reverse(), null, 2));
} finally { store.close(); }
console.log(JSON.stringify({ calls, rows: rows.map(({ caseId, goalMode, reversed, selected, passed, error }) => ({ caseId, goalMode, reversed, selected, passed, error })) }, null, 2));
