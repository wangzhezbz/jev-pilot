import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planNodeProxy, nodeBrowserNetwork } from '../src/browser-node-network.mjs';
import { proxyNames as names } from '../src/browser-network.mjs';
const original = `# user settings must survive
model = "test"
[mcp_servers.node_repl]
command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node_repl"
args = []
startup_timeout_sec = 120
env_vars = ["KEEP_ME"]
[mcp_servers.node_repl.env]
NODE_REPL_NODE_PATH = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
NODE_REPL_TRUSTED_SERVICES = "unchanged"
[mcp_servers.other]
command = "untouched"
`;
test('modern repair preserves every unrelated line and is idempotent', () => {
  const p = planNodeProxy(original, names);
  const restored = p.after.replace('NODE_USE_ENV_PROXY = "1"\n', '').replace(/env_vars = .*\n/, 'env_vars = ["KEEP_ME"]\n');
  assert.equal(restored, original);
  assert.equal(planNodeProxy(p.after, names).after, p.after);
  assert.equal(p.after.includes('NODE_USE_ENV_PROXY = "1"'), true);
});
test('an explicit proxy disable and unknown runtime are never overridden', () => {
  assert.throws(() => planNodeProxy(original.replace('[mcp_servers.node_repl.env]', '[mcp_servers.node_repl.env]\nNODE_USE_ENV_PROXY = "0"'), names), /EXPLICIT_PROXY_SETTING/);
  assert.throws(() => planNodeProxy(original.replace('command = "/Applications/', 'command = "/untrusted/Applications/'), names), /UNSUPPORTED_RUNTIME/);
});
test('ambiguous or multiline TOML remains unsupported', () => {
  for (const input of [original + '[mcp_servers.node_repl]\n', original + 'x = """multiline"""', original.replace('env_vars = ["KEEP_ME"]', 'env_vars = [\n"KEEP_ME"\n]')]) assert.throws(() => planNodeProxy(input, names));
});
test('missing allowlist is added to server, never to its environment table', () => {
  const input = original.replace('env_vars = ["KEEP_ME"]\n', '');
  const after = planNodeProxy(input, names).after;
  assert.ok(after.indexOf('env_vars =') < after.indexOf('[mcp_servers.node_repl.env]'));
});
function fixture() {
  const codexHome = mkdtempSync(join(tmpdir(), 'jev-node-network-'));
  const home = join(codexHome, 'pilot'); const file = join(codexHome, 'config.toml');
  writeFileSync(file, original);return {codexHome,home,file,names,nodeVersion:()=> 'v24.21.0'};
}
test('repair backs up bytes and cannot claim to have updated a live process', () => {
  const f=fixture();
  assert.equal(nodeBrowserNetwork(f).status, 'repair_available');assert.equal(readFileSync(f.file,'utf8'),original);
  const repaired=nodeBrowserNetwork({...f,repair:true});assert.equal(repaired.changed,true);assert.equal(repaired.existingProcessesUpdated,false);
  const backups=join(f.home,'browser-network-backups');assert.equal(readFileSync(join(backups,readdirSync(backups)[0]),'utf8'),original);
  assert.equal(nodeBrowserNetwork({...f,repair:true}).changed,false);
});
test('older node and symlinks are preserved', () => {
  const f=fixture();assert.equal(nodeBrowserNetwork({...f,repair:true,nodeVersion:()=> 'v22.0.0'}).reason,'UNSUPPORTED_NODE_VERSION');assert.equal(readFileSync(f.file,'utf8'),original);
  if(process.platform!=='win32') { const codexHome=mkdtempSync(join(tmpdir(),'jev-node-network-link-'));symlinkSync(f.file,join(codexHome,'config.toml'));assert.equal(nodeBrowserNetwork({...f,codexHome,repair:true}).reason,'UNSAFE_PATH');assert.equal(readFileSync(f.file,'utf8'),original); }
});
