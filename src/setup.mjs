import {processTable,bridgeIdentity} from './process-observation.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, chmodSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync } from 'node:fs';
import { hash, loadKey, requireValue, privateDirectory } from './core.mjs';
import { hookOverrides, runtimeFingerprint } from '../runtime/desktop/bridge.mjs';
import { summarize } from '../runtime/desktop/report.mjs';
import { withLaunchAgent } from './launch-agent.mjs';
import { maintainBrowserNetwork } from './browser-network.mjs';
export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const installHome = () => process.env.JEV_PILOT_HOME || join(homedir(), '.codex', 'jev-pilot');
export function discoverCodex() {
  const candidates = [process.env.JEV_PILOT_CODEX,
    '/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex',
    join(process.env.LOCALAPPDATA || homedir(), 'Programs', 'Codex', 'resources', 'codex.exe'),
    '/opt/Codex/resources/codex', '/opt/codex/resources/codex'];
  for (const p of candidates) if (p && existsSync(p)) return resolve(p);
  try { const command = process.platform === 'win32' ? 'where.exe' : 'which'; const p = execFileSync(command, ['codex'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim().split(/\r?\n/)[0]; if (p && !p.includes('jev-pilot') && !p.includes('jev-desktop')) return p; } catch {}
  return null;
}
const commandVersion = (command, args = ['--version']) => { try { return execFileSync(command, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0]; } catch { return null; } };
export function checkPrerequisites({node=process.versions.node,command=commandVersion}={}) {
  requireValue(+node.split('.')[0]>=24,'NODE_24_REQUIRED');
  requireValue(command(process.platform==='win32'?'curl.exe':'curl'),'CURL_REQUIRED');
  requireValue(command('rg'),'RIPGREP_REQUIRED');
}
export function desktopStatus({inspectProcesses=processTable}={}) {
  const home = installHome(), configPath = join(home, 'runtime/desktop/install.json');
  let config = null; try { config = JSON.parse(readFileSync(configPath)); } catch {}
  const realBin = config?.realBin || discoverCodex(), version = realBin ? commandVersion(realBin) : null;
  const compatible = Boolean(config && config.sha256 && typeof config.sha256 === 'object' && !Array.isArray(config.sha256) && Object.keys(config.sha256).length && version === config.verifiedVersion && Object.entries(config.sha256).every(([p, h]) => { try { return hash(readFileSync(join(home, 'runtime/desktop', p), 'utf8')) === h; } catch { return false; } }));
  const bridges=[];
  try { for(const line of readFileSync(join(home,'runtime/desktop/logs/events.jsonl'),'utf8').split('\n'))try{const e=JSON.parse(line);if(e.kind==='bridge_started'&&e.measurementSource!=='synthetic')bridges.push(e);}catch{} } catch {}
  const liveCandidates=bridges.filter(e=>{try{if(!Number.isInteger(e.pid)||e.pid<=0||!Number.isInteger(e.backendPid)||e.backendPid<=0)return false;process.kill(e.pid,0);process.kill(e.backendPid,0);return true;}catch{return false;}});
  const table=inspectProcesses(liveCandidates.flatMap(e=>[e.pid,e.backendPid]));
  const activeBridges=liveCandidates.filter(e=>bridgeIdentity(e,table)==='verified');
  const processIdentityUnknown=liveCandidates.filter(e=>bridgeIdentity(e,table)==='unverified').length;
  const ignoredReusedPids=liveCandidates.filter(e=>bridgeIdentity(e,table)==='pid_reused').length;
  const installedFingerprint=runtimeFingerprint(config?.sha256);
  const loadedRevisionMatches=activeBridges.length && activeBridges.every(e=>typeof e.runtimeFingerprint==='string')
    ? activeBridges.every(e=>e.runtimeFingerprint===installedFingerprint) : null;
  return { platform: process.platform, arch: process.arch, node: process.version, nodeSupported: +process.versions.node.split('.')[0] >= 24, curl: commandVersion(process.platform === 'win32' ? 'curl.exe' : 'curl'), rg: commandVersion('rg'), credentialsConfigured: Boolean(loadKey(home)), realBin, runtimeVersion: version, installed: Boolean(config), compatible, disabled: existsSync(join(home, 'runtime/desktop/disabled')), configuredForNextLaunch: config?.activated === true, bridgeProcessAlive: activeBridges.length>0, processIdentityUnknown, ignoredReusedPids, installedFingerprint, loadedRevisionMatches, activeBridges, latestBridge: activeBridges.at(-1)??bridges.at(-1)??null, desktopVerifiedPlatforms: ['darwin'], crossPlatformRuntimeNeedsAcceptance: ['win32', 'linux'] };
}
export function desktopMetrics() {
  const file = join(installHome(), 'runtime/desktop/logs/events.jsonl'); let events = [], malformed = 0;
  if (existsSync(file)) for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) try { events.push(JSON.parse(line)); } catch { malformed++; }
  let excluded=[];try{excluded=JSON.parse(readFileSync(join(installHome(),'runtime/desktop/logs/synthetic-threads.json'),'utf8'));}catch{}
  const legacyExcluded=new Set(Array.isArray(excluded)?excluded:[]);
  return { ...summarize(events.map(e=>legacyExcluded.has(e.threadId)?{...e,measurementSource:'synthetic'}:e)), malformedLines: malformed, path: file };
}
export async function probeHooks(realBin, hookPath) {
  const scratch = mkdtempSync(join(tmpdir(), 'jev-pilot-probe-'));
  const child = spawn(realBin, ['app-server', ...hookOverrides(process.execPath, hookPath)], { env: { ...process.env, CODEX_HOME: scratch }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); child.stderr.resume();
  let id = 0; const pending = new Map(), lines = createInterface({ input: child.stdout });
  child.on('error', () => { for (const p of pending.values()) p.reject(new Error('RUNTIME_UNAVAILABLE')); });
  lines.on('line', line => { try { const m = JSON.parse(line), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error('PROBE_FAILED')) : p.resolve(m.result); } } catch {} });
  const request = (method, params) => new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error('PROBE_TIMEOUT')); }, 10000); pending.set(n, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id: n, method, params }) + '\n'); });
  try {
    await request('initialize', { clientInfo: { name: 'jev_pilot_installer', version: '0.2.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    const result = await request('hooks/list', { cwds: [scratch] }), trust = {};
    const expected = process.platform === 'win32' ? `"${process.execPath}" "${hookPath}"` : [process.execPath, hookPath].map(s => "'" + s.replaceAll("'", "'\\''") + "'").join(' ');
    for (const layer of result.data || []) for (const h of layer.hooks || []) if (h.source === 'sessionFlags' && ['postToolUse', 'userPromptSubmit'].includes(h.eventName) && h.command === expected && !h.async && h.timeoutSec === 12) trust[h.key] = h.currentHash;
    requireValue(Object.keys(trust).length === 2, 'HOOK_COMPATIBILITY_FAILED'); return trust;
  } finally { lines.close(); child.kill(); for (const p of pending.values()) clearTimeout(p.timer); }
}
export async function setup(options = {}) {
  checkPrerequisites();
  const home=installHome(),file=join(home,'runtime/desktop/install.json');
  let backup=null,old=null;
  const components=['src','runtime','vendor','scripts','skills','web','locales','launcher','bin',process.platform==='win32'?'jev-pilot.exe':'jev-pilot'];
  if(existsSync(file)) {
    old=JSON.parse(readFileSync(file));backup=join(home,'backups',String(Date.now()));mkdirSync(backup,{recursive:true,mode:0o700});
    for(const name of components)if(existsSync(join(home,name)))cpSync(join(home,name),join(backup,name),{recursive:true});
  }
  try{return await prepareSetup(options);}
  catch(error){
    if(backup)for(const name of components)if(existsSync(join(backup,name)))cpSync(join(backup,name),join(home,name),{recursive:true});
    if(old&&options.activate)try{setOverride(old.activated?join(home,process.platform==='win32'?'jev-pilot.exe':'jev-pilot'):old.previousOverride||'');}catch{}
    throw error;
  }
}
async function prepareSetup({ activate = false, source = packageRoot } = {}) {
  requireValue(+process.versions.node.split('.')[0] >= 24, 'NODE_24_REQUIRED');
  const realBin = discoverCodex(); requireValue(realBin, 'CODEX_NOT_FOUND');
  const version = commandVersion(realBin);
  // First release targets the actually verified wire protocol. Unknown upgrades pass through.
  requireValue(version === 'codex-cli 0.155.0-alpha.9.2', 'UNVERIFIED_CODEX_VERSION');
  const home = installHome(); privateDirectory(home);
  const configPath = join(home, 'runtime/desktop/install.json'); let previous = null;
  if (existsSync(configPath)) { previous = JSON.parse(readFileSync(configPath)); cpSync(configPath, configPath + '.backup-' + Date.now()); }
  for (const name of ['src', 'runtime', 'vendor', 'scripts', 'skills', 'web', 'locales','launcher','bin']) if (resolve(source) !== resolve(home) && existsSync(join(source,name))) cpSync(join(source, name), join(home, name), { recursive: true });
  const desktop = join(home, 'runtime/desktop'), trust = await probeHooks(realBin, join(desktop, 'hook.mjs'));
  const sha256 = {};
  for (const name of ['bridge.mjs', 'router.mjs', 'hook.mjs', 'bootstrap.mjs', 'transport.mjs', 'report.mjs', '../../src/automation.mjs', '../../src/output-adapters.mjs', '../../src/prepare-output.mjs', '../../src/checkpoints.mjs', '../../src/core.mjs', '../../src/evidence.mjs', '../../src/policy.mjs', '../../src/request-guard.mjs']) sha256[name] = hash(readFileSync(join(desktop, name), 'utf8'));
  const nativeName = process.platform === 'win32' ? 'jev-pilot.exe' : 'jev-pilot';
  const launcher = join(home, nativeName), prebuilt = join(source, 'bin', process.platform + '-' + process.arch, nativeName);
  if (existsSync(prebuilt)) cpSync(prebuilt, launcher);
  else { requireValue(commandVersion('go'), 'NATIVE_LAUNCHER_REQUIRED'); execFileSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', launcher, join(source, 'launcher/main.go')], { timeout: 120000 }); }
  chmodSync(launcher, 0o700);
  let previousOverride = previous?.previousOverride ?? process.env.CODEX_CLI_PATH ?? '';
  if (process.platform === 'darwin' && !previous) try { previousOverride = execFileSync('/bin/launchctl', ['getenv', 'CODEX_CLI_PATH'], { encoding: 'utf8' }).trim(); } catch {}
  const config = { version: 2, realBin, verifiedVersion: version, node: process.execPath, trust, sha256, previousOverride, previousLaunchAgent:previous?.previousLaunchAgent, launchAgent:previous?.launchAgent, keyPath: join(home, '.env.local'), automation: true, activated: previous?.activated === true, installedAt: new Date().toISOString() };
  writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  const key = loadKey(home); if (key && !existsSync(config.keyPath)) writeFileSync(config.keyPath, 'TYPESAFE_API_KEY=' + key + '\n', { mode: 0o600 });
  if (activate) {activateDesktop(config, home, launcher);config.activated=true;}
  return { installed: home, launcher, configuredForNextLaunch: config.activated, restartRequired: config.activated, currentTaskChanged: false, credentialsConfigured: Boolean(key), browserNetwork: maintainBrowserNetwork() };
}
function setOverride(value) {
  if (process.platform === 'darwin') execFileSync('/bin/launchctl', value ? ['setenv', 'CODEX_CLI_PATH', value] : ['unsetenv', 'CODEX_CLI_PATH']);
  else if (process.platform === 'win32') {
    const script = `[Environment]::SetEnvironmentVariable('CODEX_CLI_PATH',${value ? "'" + value.replaceAll("'", "''") + "'" : '$null'},'User')`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  } else {
    const dir = join(homedir(), '.config/environment.d'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '90-jev-pilot.conf'), value ? 'CODEX_CLI_PATH="' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"\n' : '# JevPilot disabled\n', { mode: 0o600 });
    try { execFileSync('systemctl', value ? ['--user', 'set-environment', 'CODEX_CLI_PATH=' + value] : ['--user', 'unset-environment', 'CODEX_CLI_PATH']); } catch {}
  }
}
export function activateDesktop(config, home = installHome(), launcher = join(home, process.platform === 'win32' ? 'jev-pilot.exe' : 'jev-pilot')) {
  const file = join(home, 'runtime/desktop/install.json'); config = {...(config || JSON.parse(readFileSync(file)))};
  const disabled = join(home, 'runtime/desktop/disabled');
  const commit=()=>{setOverride(launcher);config.activated=true;writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});if(existsSync(disabled))unlinkSync(disabled);};
  if(process.platform==='darwin') {
    const agents=join(homedir(),'Library/LaunchAgents');mkdirSync(agents,{recursive:true});
    // Reuse the prototype's label to avoid two login jobs racing to set the same override.
    const plist=join(agents,'local.jev.codex-routing.plist');
    if(existsSync(plist)&&!config.previousLaunchAgent){const backup=join(home,'previous-launch-agent.plist');cpSync(plist,backup);config.previousLaunchAgent=backup;}
    let override='';try{override=execFileSync('/bin/launchctl',['getenv','CODEX_CLI_PATH'],{encoding:'utf8'}).trim();}catch{}
    const priorConfig=readFileSync(file);config.launchAgent=plist;
    try {withLaunchAgent({plist,launcher,domain:`gui/${process.getuid()}`},commit);}
    catch(error){writeFileSync(file,priorConfig,{mode:0o600});try{setOverride(override);}catch(rollback){throw new AggregateError([error,rollback],'ACTIVATION_ROLLBACK_FAILED');}throw error;}
  } else commit();
  return { configuredForNextLaunch: true, desktopRestarted: false };
}
export function disableDesktop() {
  const home = installHome(), file = join(home, 'runtime/desktop/install.json'), config = JSON.parse(readFileSync(file));
  writeFileSync(join(home, 'runtime/desktop/disabled'), 'disabled\n', { mode: 0o600 });
  if(process.platform==='darwin'&&config.launchAgent){
    const domain=`gui/${process.getuid()}`;try{execFileSync('/bin/launchctl',['bootout',domain+'/local.jev.codex-routing'],{stdio:'ignore'});}catch{}
    if(config.previousLaunchAgent&&existsSync(config.previousLaunchAgent)){cpSync(config.previousLaunchAgent,config.launchAgent);execFileSync('/bin/launchctl',['bootstrap',domain,config.launchAgent]);}
    else if(existsSync(config.launchAgent))unlinkSync(config.launchAgent);
  }
  setOverride(config.previousOverride || ''); config.activated = false;
  writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 }); return { disabled: true, previousOverrideRestored: true, filesPreserved: true, restartRequired: true };
}
