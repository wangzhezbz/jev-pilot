// Read-only post-hoc collection from completed synthetic workspaces.
// This does not alter the timed records or claim that each generated test ran.
import {readFile,readdir,realpath,lstat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../../src/core.mjs';
const base=process.argv[2]||'dist/acceptance-v10-20260923';
const out=process.argv[3]||'docs/reports/validation-20260923/generated-files.json';
const {records}=JSON.parse(await readFile(join(base,'results.json'),'utf8'));
const directories=new Map();
for(const name of await readdir(tmpdir()))if(name.startsWith('jev-current-ab-')){
 const path=join(tmpdir(),name);if((await lstat(path)).isDirectory())directories.set(hash(await realpath(path)),path);
}
const rows=[];
for(const r of records){
 const projectId=r.routing.find(e=>e.projectId)?.projectId,cwd=directories.get(projectId);
 const row={id:r.id,workspaceMatched:!!cwd,files:{}};
 if(cwd){
  async function collect(relative='',depth=0){
   for(const e of await readdir(join(cwd,relative),{withFileTypes:true})){
    if(e.name.startsWith('.')||e.name==='node_modules')continue;
    const name=relative?relative+'/'+e.name:e.name;
    if(e.isDirectory()&&depth<3)await collect(name,depth+1);
    else if(e.isFile()&&/\.(mjs|js|cjs|md|data|json)$/.test(name)){
     const text=await readFile(join(cwd,name),'utf8');
     if(Buffer.byteLength(text)<=100000)row.files[name]={sha256:hash(text),text:text.replace(/\/Users\/[^/\s]+/g,'<user-home>').replace(/\/(?:private\/)?var\/folders\/[^\s"']+/g,'<private-temp-path>')};
    }
   }
  }
  await collect();
 }
 rows.push(row);
}
await writeFile(out,JSON.stringify({method:'Post-hoc read-only collection, matched by recorded realpath project hash; generated test presence is not proof of test execution. Frozen independent oracles determine primary acceptance.',rows},null,2)+'\n');
console.log(JSON.stringify({runs:rows.length,matched:rows.filter(r=>r.workspaceMatched).length,files:rows.reduce((n,r)=>n+Object.keys(r.files).length,0)}));
