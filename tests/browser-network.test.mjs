import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browserNetwork, proxyNames } from '../src/browser-network.mjs';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jev-browser-network-'));
  const options = { codexHome: join(root, 'codex'), home: join(root, 'pilot') };
  const dir = join(options.codexHome, 'plugins/cache/openai-bundled/unified-computer-use/26.test');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, '.mcp.json');
  const manifest = { mcpServers: { cua_repl: { command: 'node', args: ['/fixture/@oai/cua-repl/bin/cua-repl.mjs'], env_vars: ['KEEP_ME'], env: { EXISTING: 'preserved' }, enabled_tools: ['js'], approval_policy: 'unchanged' } } };
  const original = JSON.stringify(manifest);
  writeFileSync(file, original);
  return { root, options, file, original, manifest };
}
test('proxy repair changes only the allowlist, backs up bytes, and is idempotent', () => {
  const f = fixture();
  assert.equal(browserNetwork(f.options).status, 'attention_needed');
  assert.equal(readFileSync(f.file, 'utf8'), f.original);
  const result = browserNetwork({ ...f.options, repair: true });
  assert.equal(result.changed, true);
  assert.equal(result.existingProcessesUpdated, false);
  const after = JSON.parse(readFileSync(f.file));
  assert.deepEqual(after.mcpServers.cua_repl.env_vars, ['KEEP_ME', ...proxyNames]);
  after.mcpServers.cua_repl.env_vars = ['KEEP_ME'];
  assert.deepEqual(after, f.manifest);
  const backup = join(f.options.home, 'browser-network-backups');
  assert.equal(readFileSync(join(backup, readdirSync(backup)[0]), 'utf8'), f.original);
  assert.equal(browserNetwork({ ...f.options, repair: true }).changed, false);
  assert.equal(readdirSync(backup).length, 1);
});
test('regenerated browser manifest is repaired again without duplicate backups', () => {
  const f = fixture();
  browserNetwork({ ...f.options, repair: true });
  writeFileSync(f.file, f.original);
  assert.equal(browserNetwork({ ...f.options, repair: true }).changed, true);
  assert.equal(readdirSync(join(f.options.home, 'browser-network-backups')).length, 1);
});
test('unknown plugin layout is preserved instead of guessing a repair', () => {
  const f = fixture();
  const changed = f.original.replace('cua-repl.mjs', 'new-runtime.mjs');
  writeFileSync(f.file, changed);
  const result = browserNetwork({ ...f.options, repair: true });
  assert.equal(result.changed, false);
  assert.equal(result.manifests[0].reason, 'UNSUPPORTED_MANIFEST');
  assert.equal(readFileSync(f.file, 'utf8'), changed);
});
test('malformed manifest cannot prevent the main plugin from starting', () => {
  const f = fixture(); writeFileSync(f.file, '{');
  assert.equal(browserNetwork({ ...f.options, repair: true }).manifests[0].status, 'skipped');
});
test('browser plugin absence is not an installation failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'jev-no-browser-'));
  assert.equal(browserNetwork({ codexHome: root, home: root, repair: true }).status, 'plugin_not_installed');
});
test('ready configuration never claims native fetch or Chrome connectivity',()=>{
 const f=fixture();browserNetwork({...f.options,repair:true});
 const report=browserNetwork(f.options);
 assert.equal(report.status,'ready');assert.equal(report.verificationScope,'configuration_only');
 assert.equal(report.runtimeConnectivity,'not_tested');assert.equal(report.nativeFetchConnectivity,'not_tested');
});
test('symlinked version directory cannot redirect repair outside the plugin cache', { skip: process.platform === 'win32' }, () => {
  const f = fixture();
  const root = join(f.options.codexHome, 'plugins/cache/openai-bundled/unified-computer-use');
  symlinkSync(f.root, join(root, 'external'), 'dir');
  assert.equal(browserNetwork({ ...f.options, repair: true }).manifests.length, 1);
});
