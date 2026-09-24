// Synthetic acceptance only. UI actions remain in the official host plugin.
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Store, Judge, loadConfig, loadKey, hash } from '../../src/core.mjs';
import { installHome } from '../../src/setup.mjs';
import * as current from '../../src/browser.mjs';

if (!process.argv.includes('--run')) throw Error('EXPLICIT_RUN_REQUIRED');
const out = resolve(process.argv.find(x => x.startsWith('--out='))?.slice(6) || 'dist/browser-20260924');
mkdirSync(out, { recursive: true });
const base = mkdtempSync(join(tmpdir(), 'jev-browser-live-'));
const revision = 'd3f4b471f15dd14d4d2480bd4287d5cb74191d1d';
const original = execFileSync('git', ['show', revision + ':src/browser.mjs'], { encoding: 'utf8' });
writeFileSync(join(base, 'legacy.mjs'), original.replace("'./core.mjs'", JSON.stringify(new URL('../../src/core.mjs', import.meta.url).href)));
const legacy = await import(pathToFileURL(join(base, 'legacy.mjs')));
const store = new Store({ home: join(base, 'state') }), project = 'synthetic-browser', key = loadKey(installHome());
if (!key) throw Error('MISSING_KEY');
const incident = process.argv.includes('--incident');
const protocol = { at: new Date().toISOString(), baseline: revision, candidateHash: hash(readFileSync(new URL('../../src/browser.mjs', import.meta.url), 'utf8')), driver: 'computer-use', order: incident ? ['direct','legacy','choice','choice','legacy'] : ['direct','legacy','choice','choice','legacy','legacy','choice','choice','legacy','direct'], cases: incident ? ['checkout-rollback','identity-recovery'] : ['invoice-preview'], maxPaidRequests: incident ? 48 : 24, gptTasks: 0, scope: 'Actual official host UI operations. Direct is a scripted lower bound, NOT a GPT task baseline. Cold request cache. No retries.' };
writeFileSync(join(out, 'protocol.json'), JSON.stringify(protocol, null, 2), { flag: 'wx' });
let calls = 0;
const server = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.headers.origin || req.headers['x-jev-benchmark'] !== 'synthetic' || req.method !== 'POST') { res.writeHead(403).end('{}'); return; }
  try {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100000) throw Error('BODY_LIMIT'); }
    const input = JSON.parse(raw), arm = input.arm, api = arm === 'legacy' ? legacy : current;
    const config = { ...loadConfig(store, project), cacheMs: 0, maxCalls: 2, taskMaxCalls: protocol.maxPaidRequests + 2, taskMaxWaitMs: 30000 };
    const judge = new Judge({ store, project, config, key, send: async (...args) => {
      if (++calls > protocol.maxPaidRequests) throw Error('LIVE_CALL_LIMIT');
      const { transport } = await import('../../src/core.mjs'); return transport(...args);
    } });
    const ctx = { store, project, config, judge };
    let result;
    if (req.url === '/step') {
      if (!['legacy','choice'].includes(arm) || !input.observation.snapshot.includes(incident ? 'JevPilot synthetic incident review' : 'JevPilot synthetic invoice review')) throw Error('SYNTHETIC_ONLY');
      result = await api.browserStep(ctx, input.observation);
    } else if (req.url === '/consume') result = api.consumeBrowserTicket(ctx, input.observation);
    else if (req.url === '/save') {
      writeFileSync(join(out, 'ui-runs.json'), JSON.stringify(input.rows, null, 2));
      writeFileSync(join(out, 'events.json'), JSON.stringify(store.events(project, 10000).reverse(), null, 2));
      result = { saved: true, calls };
    } else throw Error('UNKNOWN_ENDPOINT');
    res.end(JSON.stringify(result));
  } catch (e) { res.writeHead(400).end(JSON.stringify({ error: e.code || e.message })); }
});
server.listen(18744, '127.0.0.1', () => console.log(`Synthetic benchmark decision service ready; budget ${protocol.maxPaidRequests} real Jev requests.`));
