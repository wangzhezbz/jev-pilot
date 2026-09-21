import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Keep the previous login job intact if activation or its final commit fails.
export function withLaunchAgent({ plist, launcher, domain, run = execFileSync }, commit) {
  const previous = existsSync(plist) ? readFileSync(plist) : null;
  const label = domain + '/local.jev.codex-routing';
  let loaded = false, replaced = false;
  try { run('/bin/launchctl', ['print', label], { stdio: 'ignore' }); loaded = true; } catch {}
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  try {
    writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Label</key><string>local.jev.codex-routing</string><key>ProgramArguments</key><array><string>/bin/launchctl</string><string>setenv</string><string>CODEX_CLI_PATH</string><string>${escape(launcher)}</string></array><key>RunAtLoad</key><true/></dict></plist>`, { mode: 0o600 });
    run('/usr/bin/plutil', ['-lint', plist], { stdio: 'ignore' });
    if (loaded) run('/bin/launchctl', ['bootout', label], { stdio: 'ignore' });
    replaced = true;
    run('/bin/launchctl', ['bootstrap', domain, plist]);
    return commit();
  } catch (error) {
    const failures = [];
    if (replaced) try { run('/bin/launchctl', ['bootout', label], { stdio: 'ignore' }); } catch {}
    try {
      if (previous) writeFileSync(plist, previous, { mode: 0o600 });
      else if (existsSync(plist)) unlinkSync(plist);
      if (replaced && loaded && previous) run('/bin/launchctl', ['bootstrap', domain, plist]);
    } catch (rollbackError) { failures.push(rollbackError); }
    if (failures.length) throw new AggregateError([error, ...failures], 'ACTIVATION_ROLLBACK_FAILED');
    throw error;
  }
}
