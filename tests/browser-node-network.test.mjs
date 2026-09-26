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
test('TOML literal paths, mixed quote arrays and comments are preserved', () => {
  const input = original.replace(/"(\/Applications\/[^"\n]+)"/g, "'$1'")
    .replace('["KEEP_ME"]', "['KEEP_ME', 'HASH#VALUE',] # keep this comment");
  const plan = planNodeProxy(input, names);
  assert.equal(plan.nodePath, '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node');
  assert.match(plan.after, /# keep this comment/);
  assert.match(plan.after, /HASH#VALUE/);
  assert.equal(planNodeProxy(plan.after, names).after, plan.after);
});
test('Windows literal path parses then fails runtime verification without executing it', () => {
  const input = original.replace(/command = .*\n/, "command = 'C:\\Program Files\\Codex\\resources\\node_repl.exe'\n");
  assert.throws(() => planNodeProxy(input, names), /^Error: UNSUPPORTED_RUNTIME$/);
  const f = fixture(); writeFileSync(f.file, input); let probes = 0;
  const result = nodeBrowserNetwork({ ...f, repair:true, nodeVersion:()=>{ probes++; return 'v24.21.0'; } });
  assert.equal(result.reason, 'UNSUPPORTED_RUNTIME'); assert.equal(probes,0);
  assert.equal(readFileSync(f.file,'utf8'),input);
});
test('unsupported TOML is explicit, never a generic config failure or partial rewrite', () => {
  for (const value of ['"unterminated', '["x", 7]', "['x'] trailing", 'false', '"bad\\q"']) {
    const f=fixture(); const input=original.replace('env_vars = ["KEEP_ME"]', 'env_vars = '+value);
    writeFileSync(f.file,input);
    assert.equal(nodeBrowserNetwork({...f,repair:true}).reason,'UNSUPPORTED_CONFIG');
    assert.equal(readFileSync(f.file,'utf8'),input);
  }
});
const windowsConfig=readFileSync(new URL('./fixtures/windows-node-repl.toml',import.meta.url),'utf8');
test('reported Windows configuration is repaired without changing paths, trust or pipe settings',()=>{
  const plan=planNodeProxy(windowsConfig,names);
  const restored=plan.after.replace('NODE_USE_ENV_PROXY = "1"\n','').replace(/env_vars = .*\n/,'env_vars = ["CODEX_WINDOWS_REGISTERED_CORE"]\n');
  assert.equal(restored,windowsConfig);
  assert.equal(planNodeProxy(plan.after,names).after,plan.after);
  assert.equal(plan.missing.length,8);
  const f=fixture();writeFileSync(f.file,windowsConfig);let probed;
  const result=nodeBrowserNetwork({...f,repair:true,nodeVersion:path=>{probed=path;return 'v24.21.0';}});
  assert.equal(result.changed,true);assert.equal(result.existingProcessesUpdated,false);
  assert.equal(probed,plan.nodePath);assert.equal(readFileSync(f.file,'utf8'),plan.after);
});
test('Windows runtime validation rejects traversal, mismatched Node and unknown layouts',()=>{
  for(const value of [windowsConfig.replaceAll('\\app\\resources','\\app\\..\\resources'),windowsConfig.replace('\\bin\\node.exe','\\bin\\other.exe'),windowsConfig.replaceAll('OpenAI.Codex_','Unknown.App_')])assert.throws(()=>planNodeProxy(value,names),/UNSUPPORTED_RUNTIME/);
  const disabled=windowsConfig.replace('[mcp_servers.node_repl.env]','[mcp_servers.node_repl.env]\nNODE_USE_ENV_PROXY = \'0\'');
  assert.throws(()=>planNodeProxy(disabled,names),/EXPLICIT_PROXY_SETTING/);
});
