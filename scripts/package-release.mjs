// Build distributable previews with one matching launcher and no private state.
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {stagePlugin} from '../src/distribution.mjs';
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'dist/release-20260926');mkdirSync(out,{recursive:true});
const stage=stagePlugin({source:resolve('.'),destination:join(mkdtempSync(join(tmpdir(),'jev-release-')),'jev-pilot')});
const targets=[['darwin','arm64','macos'],['darwin','x64','macos'],['win32','x64','windows'],['win32','arm64','windows'],['linux','x64','linux'],['linux','arm64','linux']];
const sums=[];
for(const[os,arch,label]of targets){
 const executable=`bin/${os}-${arch}/jev-pilot${os==='win32'?'.exe':''}`;
 if(!stage.manifest.some(x=>x.path===executable))throw Error('MISSING_LAUNCHER:'+executable);
 const files=stage.manifest.filter(x=>!x.path.startsWith('bin/')||x.path===executable).map(x=>x.path);
 const file=join(out,`jev-pilot-${label}-${arch}.zip`);
 execFileSync('python3',['-c',`import json,sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1]); files=json.loads(sys.argv[3])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(root/p,'jev-pilot/'+p)
with zipfile.ZipFile(sys.argv[2]) as z:
 assert z.testzip() is None
 assert len([n for n in z.namelist() if '/bin/' in n])==1
`,stage.destination,file,JSON.stringify(files)]);
 sums.push(createHash('sha256').update(readFileSync(file)).digest('hex')+'  '+file.split('/').at(-1));
}
writeFileSync(join(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');console.log(JSON.stringify({out,packages:targets.length,checksums:'SHA256SUMS.txt'}));
