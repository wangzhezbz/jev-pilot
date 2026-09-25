import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { redact } from '../src/core.mjs';
import { discoverCodex, packageRoot } from '../src/setup.mjs';
const home=mkdtempSync(join(tmpdir(),'jev-plugin-host-')),realBin=discoverCodex(),env={...process.env,CODEX_HOME:home};
const install=JSON.parse(execFileSync(realBin,['plugin','add','jev-pilot@personal','--json'],{env,encoding:'utf8',timeout:30000}));
const child=spawn(realBin,['app-server'],{env,stdio:['pipe','pipe','pipe']});let diagnostic="";child.stderr.on("data",b=>diagnostic+=b);
let id=0;const pending=new Map(),notifications=[];const lines=createInterface({input:child.stdout});
lines.on('line',line=>{try{const m=JSON.parse(line),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method)notifications.push(m);}catch{}});
const request=(method,params)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(new Error('TIMEOUT '+method));},30000);pending.set(n,{resolve,reject,timer});child.stdin.write(JSON.stringify({id:n,method,params})+'\n');});
const report={kind:'real_codex_plugin_loading',gptCalls:0,installedVersion:install.version};
try{
 await request('initialize',{clientInfo:{name:'jev_plugin_acceptance',version:'0.2.0'},capabilities:{experimentalApi:true}});child.stdin.write('{"method":"initialized"}\n');
 const thread=await request('thread/start',{cwd:packageRoot,ephemeral:true,sandbox:'read-only',approvalPolicy:'never'});
 const deadline=Date.now()+15000;
 do {
  const result=await request('mcpServerStatus/list',{threadId:thread.thread.id,limit:100});
  const servers=result.data??[];report.servers=servers.filter(x=>JSON.stringify(x).includes('jev-pilot')).map(x=>({name:x.name,status:x.status,tools:Object.keys(x.tools||{}),error:x.error}));
  report.passed=report.servers.some(x=>['jev_pilot','jev_evidence'].every(name=>x.tools.includes(name)));
  if(report.passed)break;
  await new Promise(resolve=>setTimeout(resolve,250));
 } while(Date.now()<deadline);
}catch(e){report.error=e.message;report.passed=false;}
finally{lines.close();child.kill();for(const p of pending.values())clearTimeout(p.timer);}
if(!report.passed)console.error(redact(diagnostic.slice(-6000)));
mkdirSync(join(packageRoot,'docs/reports'),{recursive:true});
writeFileSync(join(packageRoot,'docs/reports/plugin-host.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
