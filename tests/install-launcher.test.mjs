import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installLauncher,configuredLauncher} from '../src/install-launcher.mjs';
const fixture=()=>{const home=mkdtempSync(join(tmpdir(),'launcher-update-')),source=join(home,'source');writeFileSync(source,'new binary');return {home,source,platform:'win32'};};
test('identical Windows launcher is reused without any publication or metadata change',()=>{
 const f=fixture(),base=join(f.home,'jev-pilot.exe');writeFileSync(base,'new binary');const before=statSync(base);
 const result=installLauncher({...f,publish:()=>{throw Error('locked executable must not be replaced');}});
 assert.equal(result.reused,true);assert.equal(result.launcher,base);assert.equal(statSync(base).mtimeMs,before.mtimeMs);
});
test('changed Windows launcher keeps running old bytes and reuses immutable new version',()=>{
 const f=fixture(),base=join(f.home,'jev-pilot.exe');writeFileSync(base,'old binary');
 const result=installLauncher(f);assert.equal(result.reused,false);assert.match(result.launcherFile,/^jev-pilot-[a-f0-9]{64}\.exe$/);
 assert.equal(readFileSync(base,'utf8'),'old binary');assert.equal(readFileSync(result.launcher,'utf8'),'new binary');
 assert.equal(configuredLauncher(f.home,result,'win32'),result.launcher);
 assert.equal(installLauncher({...f,publish:()=>{throw Error('must reuse');}}).reused,true);
 assert.equal(readdirSync(f.home).some(n=>n.endsWith('.tmp')),false);
});
test('failed Windows publication leaves existing launcher and config usable',()=>{
 const f=fixture();writeFileSync(join(f.home,'jev-pilot.exe'),'old');
 assert.throws(()=>installLauncher({...f,publish:()=>{throw Object.assign(Error('locked'),{code:'EPERM'});}}),/locked/);
 assert.equal(readFileSync(configuredLauncher(f.home,{},'win32'),'utf8'),'old');assert.equal(readdirSync(f.home).some(n=>n.endsWith('.tmp')),false);
});
test('configured launcher rejects paths outside install root',()=>{
 for(const name of ['../jev-pilot.exe','C:\\evil.exe','other.exe'])assert.throws(()=>configuredLauncher('/safe',{launcherFile:name},'win32'),/INVALID_LAUNCHER_FILE/);
});
test('macOS updates retain executable mode and stable name',()=>{
 const f=fixture();writeFileSync(join(f.home,'jev-pilot'),'old');const result=installLauncher({...f,platform:'darwin'});
 assert.equal(result.launcherFile,'jev-pilot');assert.equal(readFileSync(result.launcher,'utf8'),'new binary');assert.equal(statSync(result.launcher).mode&0o700,0o700);
});
