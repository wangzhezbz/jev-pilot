import { mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { packageRoot } from '../src/setup.mjs';
import { createHash } from 'node:crypto';
const platforms = process.argv.includes('--all') ? [['darwin','arm64'],['darwin','x64'],['win32','x64'],['win32','arm64'],['linux','x64'],['linux','arm64']] : [[process.platform, process.arch]];
const builds=[];
for (const [platform,arch] of platforms) {
  const dir=join(packageRoot,'bin',platform+'-'+arch);mkdirSync(dir,{recursive:true});
  const target=join(dir,platform==='win32'?'jev-pilot.exe':'jev-pilot');
  execFileSync('go',['build','-trimpath','-ldflags=-s -w','-o',target,join(packageRoot,'launcher/main.go')],{env:{...process.env,GOOS:platform==='win32'?'windows':platform,GOARCH:arch==='x64'?'amd64':arch,CGO_ENABLED:'0'},timeout:120000});
  builds.push({platform,arch,sha256:createHash('sha256').update(readFileSync(target)).digest('hex'),checksumEncoding:'raw-file-bytes',path:target});
}
writeFileSync(join(packageRoot,'bin/builds.json'),JSON.stringify(builds,null,2));console.log(JSON.stringify(builds));
