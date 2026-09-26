import {readFileSync,readdirSync,lstatSync,mkdirSync,copyFileSync,chmodSync,existsSync,realpathSync} from 'node:fs';
import {resolve,join,relative,dirname,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {requireValue} from './core.mjs';
const roots=['.codex-plugin','.mcp.json','skills','src','runtime','vendor','adapters','scripts','web','locales','LICENSE','plugin.json','mcp.json','package.json','release-state.json','bin','launcher','docs'];
const privateName=n=>/^(?:\.git|\.env(?:\..*)?|dist|node_modules|coverage|__pycache__|private|native-home|auth\.json|state\.sqlite(?:-.*)?|install\.json(?:\..*)?)$/.test(n)||/\.(?:local|sqlite|sqlite-wal|sqlite-shm|pyc|pem|key)$/.test(n);
export function stagePlugin({source,destination,includeReports=false}){
 source=realpathSync(source);destination=resolve(destination);let ancestor=dirname(destination);while(!existsSync(ancestor))ancestor=dirname(ancestor);const canonicalDestination=resolve(realpathSync(ancestor),relative(ancestor,destination));const rel=relative(source,canonicalDestination);
 requireValue(rel!==''&&(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel)),'STAGING_INSIDE_SOURCE');
 requireValue(!existsSync(destination),'STAGING_DESTINATION_EXISTS');
 const files=[];
 function visit(path){
  // Historical evidence stays in git; runtime installs need only user docs.
  if(!includeReports&&path===join('docs','reports'))return;
  const full=join(source,path),stat=lstatSync(full);
  requireValue(!stat.isSymbolicLink(),'DISTRIBUTION_SYMLINK');
  if(stat.isDirectory()){for(const name of readdirSync(full))if(!privateName(name))visit(join(path,name));return;}
  requireValue(stat.isFile(),'DISTRIBUTION_SPECIAL_FILE');
  const data=readFileSync(full);
  if(stat.size<2000000)requireValue(!/apikey_[a-f0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(data.toString()),'SECRET_IN_DISTRIBUTION');
  files.push({path,bytes:stat.size,sha256:createHash('sha256').update(data).digest('hex'),mode:stat.mode&0o777});
 }
 for(const root of roots)if(existsSync(join(source,root)))visit(root);
 for(const name of readdirSync(source))if(/^README(?:\.[\w-]+)?\.md$/.test(name))visit(name);
 for(const required of ['.codex-plugin/plugin.json','.mcp.json','src/server.mjs','skills/jev-pilot/SKILL.md'])requireValue(files.some(f=>f.path.split('\\').join('/')===required),'INCOMPLETE_DISTRIBUTION');
 mkdirSync(destination,{recursive:true,mode:0o700});
 for(const f of files){const target=join(destination,f.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(source,f.path),target);chmodSync(target,f.mode);}
 return {destination,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),manifest:files.map(({mode,...f})=>f)};
}
