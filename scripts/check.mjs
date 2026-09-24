import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packageRoot } from '../src/setup.mjs';
const manifests=['plugin.json','.codex-plugin/plugin.json'].map(path=>JSON.parse(readFileSync(join(packageRoot,path),'utf8')));
if(manifests[0].name!==manifests[1].name||manifests[0].version!==manifests[1].version)throw new Error('PLUGIN_MANIFEST_VERSION_MISMATCH');
const files = [];
function walk(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { if (['.git', 'node_modules', 'dist', 'bin'].includes(entry.name)) continue; const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else files.push(path); } }
walk(packageRoot); let modules = 0;
for (const file of files) {
  if (/\.(mjs|js)$/.test(file)) { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); modules++; }
  if (/\.json$/.test(file)) JSON.parse(readFileSync(file, 'utf8'));
  if (statSync(file).size < 2000000) {
    const source = readFileSync(file, 'utf8');
    if (/apikey_[a-f0-9]{20,}/.test(source) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) throw new Error('SECRET_IN_PACKAGE: ' + relative(packageRoot, file));
  }
}
console.log(JSON.stringify({ checkedFiles: files.length, checkedModules: modules, jsonAndSecretScan: 'passed' }));
