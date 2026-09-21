#!/usr/bin/env node
import { Pilot } from '../src/pilot.mjs';
import { desktopStatus, desktopMetrics, setup, activateDesktop, disableDesktop } from '../src/setup.mjs';
let result;
try {
  const command = process.argv[2] || 'doctor';
  if (command === 'doctor') result = desktopStatus();
  else if (command === 'report') result = desktopMetrics();
  else if (command === 'setup') result = await setup({ activate: process.argv.includes('--activate') });
  else if (command === 'enable') result = activateDesktop();
  else if (command === 'disable') result = disableDesktop();
  else if (command === 'dashboard') { const { dashboard } = await import('../src/dashboard.mjs'); const running = await dashboard(process.argv[3] || process.cwd()); result = { url: running.url }; }
  else if (command === 'call') {
    let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 2000000) throw new Error('INPUT_LIMIT'); }
    const pilot = new Pilot(); try { result = await pilot.call(JSON.parse(raw)); } finally { pilot.close(); }
  } else throw new Error('UNKNOWN_COMMAND');
  console.log(JSON.stringify(result, null, 2));
} catch (e) { console.error(JSON.stringify({ error: typeof e.code === 'string' ? e.code : e.message || 'FAILED' })); process.exitCode = 1; }
