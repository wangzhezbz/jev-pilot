import { readdirSync, readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { nodeBrowserNetwork } from './browser-node-network.mjs';

export const proxyNames = ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'];
const digest = text => createHash('sha256').update(text).digest('hex');

// Only repair the known browser plugin manifest, never the app, launch flags or
// security settings. Values remain in the existing parent environment.
export function browserNetwork({ repair = false, codexHome = process.env.CODEX_HOME || join(homedir(), '.codex'), home = process.env.JEV_PILOT_HOME || join(homedir(), '.codex', 'jev-pilot') } = {}) {
  const root = join(codexHome, 'plugins/cache/openai-bundled/unified-computer-use');
  const nodeRepl = nodeBrowserNetwork({ codexHome, home, repair, names: proxyNames });
  const result = { manifests: [], nodeRepl, changed: nodeRepl.changed, existingProcessesUpdated: false,
    // This function inspects/repairs configuration, not the official native fetch
    // transport. A ready allowlist is not proof that Chrome is connected.
    verificationScope: 'configuration_only', runtimeConnectivity: 'not_tested',
    nativeFetchConnectivity: 'not_tested' };
  let versions;
  try { versions = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).slice(0, 100); }
  catch (error) { return { ...result, status: error.code === 'ENOENT' ? nodeRepl.status === 'not_configured' ? 'plugin_not_installed' : nodeRepl.status : 'unavailable' }; }
  for (const version of versions) {
    const file = join(root, version.name, '.mcp.json');
    try {
      if (lstatSync(file).isSymbolicLink() || realpathSync(file) !== join(realpathSync(codexHome), 'plugins/cache/openai-bundled/unified-computer-use', version.name, '.mcp.json')) throw new Error('UNSAFE_PATH');
      if (lstatSync(file).size > 1000000) throw new Error('UNSUPPORTED_MANIFEST');
      const before = readFileSync(file, 'utf8'), manifest = JSON.parse(before), server = manifest.mcpServers?.cua_repl;
      const args = server?.args;
      if (!Array.isArray(args) || !args.some(a => typeof a === 'string' && a.replaceAll('\\', '/').endsWith('/@oai/cua-repl/bin/cua-repl.mjs')) || (server.env_vars !== undefined && (!Array.isArray(server.env_vars) || !server.env_vars.every(x => typeof x === 'string')))) throw new Error('UNSUPPORTED_MANIFEST');
      const missing = proxyNames.filter(name => !server.env_vars?.includes(name));
      const row = { version: version.name, missing, status: missing.length ? 'repair_available' : 'ready' };
      if (repair && missing.length) {
        const backupDir = join(home, 'browser-network-backups');
        mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        const backup = join(backupDir, digest(before) + '.json');
        try { writeFileSync(backup, before, { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
        server.env_vars = [...(server.env_vars || []), ...missing];
        const after = JSON.stringify(manifest, null, 2) + '\n';
        const temp = file + '.jev-' + randomUUID();
        writeFileSync(temp, after, { flag: 'wx', mode: 0o600 });
        if (readFileSync(file, 'utf8') !== before) throw new Error('MANIFEST_CHANGED');
        renameSync(temp, file);
        Object.assign(row, { status: 'repaired', missing: [], added: missing, beforeHash: digest(before), afterHash: digest(after) });
        result.changed = true;
      }
      result.manifests.push(row);
    } catch (error) {
      result.manifests.push({ version: version.name, status: 'skipped', reason: ['UNSAFE_PATH','UNSUPPORTED_MANIFEST','MANIFEST_CHANGED'].includes(error.message) ? error.message : 'MANIFEST_UNAVAILABLE' });
    }
  }
  const nodeAttention = ['repair_available', 'attention_needed'].includes(nodeRepl.status);
  result.status = nodeAttention ? 'attention_needed' : result.changed ? 'repaired_for_next_plugin_process' : result.manifests.length && result.manifests.every(m => m.status === 'ready') ? 'ready' : nodeRepl.status === 'configured_for_new_process' && !result.manifests.length ? nodeRepl.status : 'attention_needed';
  return result;
}

export function maintainBrowserNetwork(options = {}) {
  if (process.env.JEV_PILOT_BROWSER_PROXY_REPAIR === '0') return { status: 'automatic_repair_disabled' };
  return browserNetwork({ ...options, repair: true });
}
