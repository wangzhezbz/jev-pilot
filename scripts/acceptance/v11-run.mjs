// Opt-in paid benchmark. Real Codex models and Jev; synthetic workspaces only.
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
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
import {common} from '../benchmark/tasks.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required: real model usage');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'dist/v11-cost-fix-20260923');
await mkdir(out,{recursive:true});
const bin=discoverCodex(),key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const models=['gpt-6-sol','gpt-6-luna'],jobs=[];
const selectedTasks=tasks.filter(t=>['bug_fix','incident'].includes(t.id));
for(let repeat=0;repeat<1;repeat++)for(const [ti,task]of selectedTasks.entries())for(const [mi,model]of models.entries())jobs.push({model,task:task.id,repeat,arms:(repeat+mi+ti)%2?['auto','fixed']:['fixed','auto']});
const runCount=jobs.length*2;
const config={'features.apps':false,'features.multi_agent':false,'features.code_mode':false,'features.code_mode_host':false,web_search:'disabled','hooks.Stop':[]};
const hashes={};for(const path of ['src/core.mjs','src/request-guard.mjs','src/automation.mjs','src/evidence.mjs','src/policy.mjs','runtime/desktop/router.mjs','runtime/desktop/bridge.mjs','scripts/benchmark/tasks.mjs','scripts/acceptance/tasks.mjs','scripts/acceptance/v11-run.mjs'])hashes[path]=hash(await readFile(path,'utf8'));
const protocol={at:new Date().toISOString(),jobs,runs:runCount,models,initialEffort:'medium',concurrency:1,hashes,config,quality:'Frozen independent oracle after inference; unchanged protected fixtures; failures retained; no retries replacing failed runs.',stopRule:'Stop the whole benchmark on infrastructure or provider usage/rate limits; retain every attempted arm. No substitution, no selective retry.',timeLimitMs:240000,baseline:'medium, matching the current ordinary desktop setting',sourceFreeze:'No product changes during this experiment',scope:'Exploratory 8-run cost-fix pilot, not a powered saving claim. Real engine and current product bridge. Fixed arm uses identical hooks but no Jev and holds medium. Automatic arm enables actual product judge and automation. No GUI latency or account debit measurement; all existing model settings except effort preserved. Repeats exploratory, not statistically powered.'};
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
 const cwd=await mkdtemp(join(tmpdir(),'jev-current-ab-')),task=tasks.find(t=>t.id===job.task);
 for(const [name,value]of Object.entries(task.files))await writeFile(join(cwd,name),value);
 for(const args of [['init','--quiet','-b','main'],['add','.'],['-c','user.name=Jev Benchmark','-c','user.email=benchmark@example.invalid','-c','commit.gpgsign=false','commit','--quiet','-m','Synthetic fixture']])if(spawnSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd,stdio:'ignore'}).status!==0)throw Error('FIXTURE_FAILED');
 const record={id,...job,arm,startedAt:new Date().toISOString(),status:'starting',usage:[],errors:[]};delete record.arms;
 const env={...process.env};delete env.CODEX_THREAD_ID;delete env.CODEX_SESSION_ID;delete env.CODEX_CLI_PATH;delete env.TYPESAFE_API_KEY;
 const hook=resolve('runtime/desktop/hook.mjs'),before=Object.fromEntries(['SIGTERM','SIGINT'].map(k=>[k,new Set(process.listeners(k))]));
 let c,bridge,probe,pc,timer,t0,store;
 try{
  probe=spawn(bin,['app-server',...hookOverrides(process.execPath,hook)],{env,stdio:['pipe','pipe','pipe']});probe.stderr.resume();pc=client(probe.stdin,probe.stdout);await init(pc);
  const hooks=await pc.request('hooks/list',{cwds:[cwd]}),trust={};for(const layer of hooks.data??[])for(const h of layer.hooks??[])if(h.source==='sessionFlags'&&h.command?.includes(hook)&&!h.async&&h.timeoutSec===12)trust[h.key]=h.currentHash;
  if(Object.keys(trust).length!==2)throw Error('HOOK_IDENTITY');pc.close();probe.kill();
  const input=new PassThrough(),output=new PassThrough();store=new Store({home:join(dir,'private')});
  bridge=await runBridge({realBin:bin,args:['app-server'],trust,input,output,env:{...env,TYPESAFE_API_KEY:key},keyPath:join(installHome(),'.env.local'),logPath:join(dir,'routing.jsonl'),automation:arm==='auto'?{store,key}:false,
    ...(arm==='fixed'?{judge:async()=>({answer:{type:'choice',choice:'keep',confidence:1,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k==='keep'?1:0]))},model:'fixed-control-no-api',inputTokens:0,outputTokens:0})}:{})});
  bridge.child.stderr.unpipe(process.stderr);bridge.child.stderr.resume();c=client(input,output);await init(c);
  const thread=await c.request('thread/start',{model:job.model,cwd,runtimeWorkspaceRoots:[cwd],ephemeral:true,sandbox:'workspace-write',approvalPolicy:'never',config,selectedCapabilityRoots:[],baseInstructions:'You are a coding assistant. Complete the task using the available tools.',developerInstructions:common});record.threadId=thread.thread.id;
  let complete;const done=new Promise(r=>complete=r);c.listeners.push(m=>{const p=m.params;if(p?.threadId!==record.threadId)return;if(m.method==='turn/started')record.turnId=p.turn.id;if(m.method==='thread/tokenUsage/updated')record.usage.push(p.tokenUsage);if(m.method==='error')record.errors.push(p.error?.message||'runtime error');if(m.method==='turn/completed'){record.status=p.turn.status;complete();}});
  t0=performance.now();timer=setTimeout(()=>{record.status='timeout';if(record.turnId)c.request('turn/interrupt',{threadId:record.threadId,turnId:record.turnId}).catch(()=>{});complete();},240000);
  await c.request('turn/start',{threadId:record.threadId,model:job.model,effort:'medium',input:[{type:'text',text:task.prompt}]});await done;clearTimeout(timer);
  record.wallMs=Math.round(performance.now()-t0);record.tokens=record.usage.at(-1)?.total??null;record.quality=await validate(task,cwd);record.passed=record.status==='completed'&&record.quality.pass;
  await bridge.flushLog(); await bridge.automation?.flush?.();
  record.jevEvents=store.events(store.project(cwd),10000);
  record.artifacts={}; for(const name of ['diagnosis.md','report.json','incident.md','findings.data','singleflight.mjs','reconcile.mjs'])try{record.artifacts[name]=await readFile(join(cwd,name),'utf8');}catch{}
 }catch(e){record.status='infrastructure_error';record.error=e.code||e.message;record.passed=false;record.wallMs=t0?Math.round(performance.now()-t0):null;}
 finally{
  clearTimeout(timer);await bridge?.flushLog();c?.close();pc?.close();probe?.kill();bridge?.child.kill();await bridge?.cleanup();if(arm==='fixed')store?.close();
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
