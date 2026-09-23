// Opt-in paid benchmark. Real Codex models and Jev; synthetic workspaces only.
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {runBridge,hookOverrides} from '../../runtime/desktop/bridge.mjs';
import {effortQuestion} from '../../runtime/desktop/router.mjs';
import {Store,hash,loadKey} from '../../src/core.mjs';
import {installHome,discoverCodex} from '../../src/setup.mjs';
import {tasks,validate} from './tasks.mjs';
import {homedir} from 'node:os';
import {timelineEntry} from './timeline.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required: real model usage');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'dist/workflow-clean-20260923');
await mkdir(out,{recursive:true});
const bin=discoverCodex(),key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const models=['gpt-6-sol'],jobs=[];
const selectedTasks=tasks.filter(t=>['bug_fix','incident'].includes(t.id)).map(t=>({...t,prompt:t.prompt.replace('First read this log through a shell command with an output limit sufficient for the entire file (at least 25000 output tokens); do not prefilter it yourself. ','')}));
const orders=[['bare','idle','auto'],['auto','idle','bare'],['idle','auto','bare'],['bare','auto','idle']];
for(let repeat=0;repeat<1;repeat++)for(const task of selectedTasks)jobs.push({model:models[0],task:task.id,repeat,arms:orders[jobs.length]});
const runCount=jobs.length*3;
const config={'features.apps':false,'features.multi_agent':false,web_search:'disabled','hooks.Stop':[]};
const common='Complete the task inside the current working directory only. Use local file and shell tools as needed. No unrelated projects, credentials, browsing, subagents, deletion, or changes to existing tests. The supplied Jev tool may contact its service. Do not ask questions. Write the requested deliverables and run relevant local checks. Final response: concise factual summary with verification results.';
const skill=await readFile('skills/jev-pilot/SKILL.md','utf8'),reference=await readFile('skills/jev-pilot/references/operations.md','utf8');
const disableArgs=[];
const hashes={};for(const path of ['src/core.mjs','src/request-guard.mjs','src/automation.mjs','src/evidence.mjs','src/policy.mjs','runtime/desktop/router.mjs','runtime/desktop/bridge.mjs','skills/jev-pilot/SKILL.md','skills/jev-pilot/references/operations.md','scripts/benchmark/tasks.mjs','scripts/acceptance/tasks.mjs','scripts/acceptance/workflow-run.mjs','src/distribution.mjs'])hashes[path]=hash(await readFile(path,'utf8'));
const protocol={at:new Date().toISOString(),jobs,runs:runCount,models,initialEffort:'medium',concurrency:1,hashes,config,quality:'Frozen independent oracle after inference; protected fixtures unchanged; failed attempts retained.',stopRule:'Stop on infrastructure or provider rate/quota error, no substitution or retries.',timeLimitMs:240000,scope:'Controlled native app-server experiment, not desktop UI or account billing. Bare: native engine. Idle: adapter hooks, no Jev, fixed effort. Auto: bridge plus the native plugin manager installed JevPilot alone in a fresh private CODEX_HOME. Native skill discovery and loading, no injected skill text. All arms use clean homes with only a private auth symlink and public model catalog. Verify MCP inventory before any inference; abort if unexpected or duplicate tools exist. Native default base instructions and code mode retained. Six-run diagnostic after prior interrupted experiments; not statistically powered. All previous costs retained separately. No significance claim. Startup measured separately. No required Jev use, no forced full reads.',tasks:selectedTasks.map(t=>({id:t.id,prompt:t.prompt,files:Object.fromEntries(Object.entries(t.files).map(([k,v])=>[k,hash(v)]))}))};
await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
function client(input,output){
 let id=0;const pending=new Map(),listeners=[];const lines=createInterface({input:output});
 lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(Error('RPC_ERROR')):p.yes(m.result);}}else if(m.id!==undefined)input.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Unexpected interaction'}})+'\n');else for(const f of listeners)f(m);});
 return {listeners,request:(method,params)=>new Promise((yes,no)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);no(Error('RPC_TIMEOUT'));},30000);pending.set(n,{yes,no,timer});input.write(JSON.stringify({id:n,method,params})+'\n');}),notify:method=>input.write(JSON.stringify({method})+'\n'),close:()=>{lines.close();for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('CLOSED'));}pending.clear();}};
}
async function init(c){await c.request('initialize',{clientInfo:{name:'jev_current_benchmark',version:'1'},capabilities:{experimentalApi:true}});c.notify('initialized');}
const records=[];
runs: for(const job of jobs)for(const arm of job.arms){
 const id=`${job.model}-${job.task}-${job.repeat}-${arm}`,dir=join(out,id);await mkdir(dir);
 const cwd=await mkdtemp(join(tmpdir(),'jev-current-ab-')),task=selectedTasks.find(t=>t.id===job.task);
 for(const [name,value]of Object.entries(task.files))await writeFile(join(cwd,name),value);
 for(const args of [['init','--quiet','-b','main'],['add','.'],['-c','user.name=Jev Benchmark','-c','user.email=benchmark@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Synthetic fixture']])if(spawnSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd,stdio:'ignore'}).status!==0)throw Error('FIXTURE_FAILED');
 const record={id,...job,arm,startedAt:new Date().toISOString(),status:'starting',usage:[],errors:[]};delete record.arms;
 const env={...process.env};delete env.CODEX_THREAD_ID;delete env.CODEX_SESSION_ID;delete env.CODEX_CLI_PATH;delete env.TYPESAFE_API_KEY;
 const hook=resolve('runtime/desktop/hook.mjs'),before=Object.fromEntries(['SIGTERM','SIGINT'].map(k=>[k,new Set(process.listeners(k))]));
 let c,bridge,probe,pc,timer,t0,store,native; const initAt=performance.now();
 const cleanHome=await mkdtemp(join(tmpdir(),'jev-native-home-'));record.nativeHomeIsExternal=true;await symlink(join(homedir(),'.codex/auth.json'),join(cleanHome,'auth.json'));env.CODEX_HOME=cleanHome;
 const catalog=JSON.parse(await readFile(join(homedir(),'.codex/models_cache.json'),'utf8'));await writeFile(join(cleanHome,'models.json'),JSON.stringify({models:catalog.models}));
 const nativeArgs=['app-server','-c',`model_catalog_json=${JSON.stringify(join(cleanHome,'models.json'))}`];
 try{
  const trust={};
  if(arm!=='bare'){
  probe=spawn(bin,[...nativeArgs,...disableArgs,...hookOverrides(process.execPath,hook)],{env,stdio:['pipe','pipe','pipe']});probe.stderr.resume();pc=client(probe.stdin,probe.stdout);await init(pc);
  const hooks=await pc.request('hooks/list',{cwds:[cwd]});for(const layer of hooks.data??[])for(const h of layer.hooks??[])if(h.source==='sessionFlags'&&h.command?.includes(hook)&&!h.async&&h.timeoutSec===12)trust[h.key]=h.currentHash;
  if(Object.keys(trust).length!==2)throw Error('HOOK_IDENTITY');pc.close();probe.kill();
  }
  const input=new PassThrough(),output=new PassThrough();store=new Store({home:join(dir,'private')});
  const args=[...nativeArgs,...disableArgs];env.JEV_PILOT_HOME=store.home;
  if(arm==='auto'){
   await writeFile(join(store.home,'.env.local'),'TYPESAFE_API_KEY='+key+'\n',{mode:0o600});
   const install=spawnSync(bin,['plugin','add','jev-pilot@personal','--json'],{env,encoding:'utf8',timeout:30000});if(install.status!==0)throw Error('PLUGIN_INSTALL_FAILED');record.pluginVersion=JSON.parse(install.stdout).version;
  }
  if(arm==='bare'){native=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});native.stderr.resume();c=client(native.stdin,native.stdout);}
  else {
  bridge=await runBridge({realBin:bin,args,trust,input,output,env:{...env,TYPESAFE_API_KEY:key},keyPath:join(installHome(),'.env.local'),logPath:join(dir,'routing.jsonl'),automation:arm==='auto'?{store,key}:false,
    ...(arm==='idle'?{judge:async()=>({answer:{type:'choice',choice:'keep',confidence:1,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k==='keep'?1:0]))},model:'fixed-control-no-api',inputTokens:0,outputTokens:0})}:{})});
  bridge.child.stderr.unpipe(process.stderr);bridge.child.stderr.resume();c=client(input,output);}
  await init(c);
  const thread=await c.request('thread/start',{model:job.model,cwd,runtimeWorkspaceRoots:[cwd],ephemeral:true,sandbox:'workspace-write',approvalPolicy:'never',config,developerInstructions:common});record.threadId=thread.thread.id;
  const readyUntil=Date.now()+20000;
  do {
   const status=await c.request('mcpServerStatus/list',{threadId:record.threadId,limit:100});
   record.mcpServers=(status.data??[]).map(x=>({name:x.name,tools:Object.keys(x.tools??{}),error:x.error}));
   const active=record.mcpServers.filter(x=>x.tools.length);
   if(active.some(x=>x.name!=='jev-pilot'))throw Error('UNEXPECTED_MCP');
   if(arm!=='auto'&&active.length)throw Error('CONTAMINATED_CONTROL');
   if(arm!=='auto'||active.length===1)break;
   await new Promise(r=>setTimeout(r,200));
  }while(Date.now()<readyUntil);
  if(arm==='auto'&&!record.mcpServers.some(x=>x.name==='jev-pilot'&&x.tools.length===1&&x.tools[0]==='jev_pilot'))throw Error('MCP_NOT_READY');
  record.startupMs=Math.round(performance.now()-initAt);record.completedItems=[];record.timeline=[];
  let complete;const done=new Promise(r=>complete=r);c.listeners.push(m=>{const p=m.params;if(p?.threadId!==record.threadId)return;const stamp=timelineEntry(m,performance.now()-t0);if(stamp)record.timeline.push(stamp);if(m.method==='item/completed')record.completedItems.push(p.item);if(m.method==='turn/started')record.turnId=p.turn.id;if(m.method==='thread/tokenUsage/updated')record.usage.push(p.tokenUsage);if(m.method==='error')record.errors.push(p.error?.message||'runtime error');if(m.method==='thread/tokenUsage/updated')void writeFile(join(dir,'usage-latest.json'),JSON.stringify(p.tokenUsage));if(m.method==='turn/completed'){record.status=p.turn.status;complete();}});
  t0=performance.now();timer=setTimeout(()=>{record.status='timeout';if(record.turnId)c.request('turn/interrupt',{threadId:record.threadId,turnId:record.turnId}).catch(()=>{});complete();},240000);
  record.timeline.push({method:'turn/start:sent',elapsedMs:0});await c.request('turn/start',{threadId:record.threadId,model:job.model,effort:'medium',input:[{type:'text',text:task.prompt}]});record.timeline.push({method:'turn/start:acknowledged',elapsedMs:performance.now()-t0});await done;clearTimeout(timer);
  record.wallMs=Math.round(performance.now()-t0);record.tokens=record.usage.at(-1)?.total??null;record.quality=await validate(task,cwd);record.passed=record.status==='completed'&&record.quality.pass;
  await bridge?.flushLog(); await bridge?.flushAutomation?.();
  record.jevEvents=store.events(store.project(cwd),10000);record.totalMs=record.startupMs+record.wallMs;
  record.artifacts={}; for(const name of ['diagnosis.md','report.json','incident.md','findings.data','singleflight.mjs','reconcile.mjs'])try{record.artifacts[name]=await readFile(join(cwd,name),'utf8');}catch{}
 }catch(e){record.status='infrastructure_error';record.error=e.code||e.message;record.passed=false;record.wallMs=t0?Math.round(performance.now()-t0):null;}
 finally{
  clearTimeout(timer);await bridge?.flushLog();c?.close();pc?.close();probe?.kill();native?.kill();bridge?.child.kill();await bridge?.cleanup();if(arm!=='auto')store?.close();
  for(const k of ['SIGTERM','SIGINT'])for(const fn of process.listeners(k))if(!before[k].has(fn))process.removeListener(k,fn);
  record.routing=await readFile(join(dir,'routing.jsonl'),'utf8').then(s=>s.trim().split('\n').filter(Boolean).map(JSON.parse)).catch(()=>[]);
  const serialized=JSON.stringify(record,null,2);if(serialized.includes(key))throw Error('SECRET_IN_RECORD');await writeFile(join(dir,'run.json'),serialized);
 }
 records.push(record);await writeFile(join(out,'results.json'),JSON.stringify({protocol,records},null,2));await writeFile(join(out,'progress.json'),JSON.stringify({planned:runCount,completed:records.length,results:records.map(r=>({id:r.id,passed:r.passed,status:r.status}))},null,2));
 console.log(JSON.stringify({id,passed:record.passed,status:record.status,wallMs:record.wallMs,tokens:record.tokens?.totalTokens,changes:record.routing.filter(e=>['applied','start_forwarded'].includes(e.status)).length}));
 if(record.status==='infrastructure_error'||record.errors.some(e=>/usage limit|rate limit|quota/i.test(e))){await writeFile(join(out,'stop.json'),JSON.stringify({reason:'infrastructure_or_provider_limit',id,status:record.status,error:record.error,errors:record.errors}));process.exitCode=2;break runs;}
 if(process.exitCode)break;
}
await writeFile(join(out,'results.json'),JSON.stringify({protocol,records},null,2));
