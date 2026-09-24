// Paid bounded exploratory test: original native Codex, local investigation, Jev investigation.
// Adapted from delegation-run.mjs; no forced tool invocation or pre-injected evidence.
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {toml} from '../../runtime/desktop/bridge.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Store,hash,loadKey} from '../../src/core.mjs';
import {Pilot} from '../../src/pilot.mjs';
import {installHome,discoverCodex} from '../../src/setup.mjs';
import {investigationTasks,validateInvestigation} from './investigation-tasks.mjs';
import {timelineEntry} from './timeline.mjs';
import {stopTask,nativeTerminal} from './terminal-state.mjs';

const execute=process.argv.includes('--run');if(!execute&&!process.argv.includes('--plan'))throw Error('EXPLICIT_RUN_OR_PLAN_REQUIRED');
const packed=process.argv.includes('--packed');
const guided=process.argv.includes('--guided')||packed;
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/investigation-ab-20260924');
const sourcePaths=['scripts/acceptance/investigation-run.mjs','scripts/acceptance/investigation-tasks.mjs','src/investigate.mjs','src/evidence.mjs','src/evidence-tool.mjs','src/model-result.mjs','src/core.mjs','src/policy.mjs','src/pilot.mjs','src/server.mjs','scripts/acceptance/terminal-state.mjs'];
sourcePaths.push('src/evidence-projection.mjs');
if(guided)sourcePaths.push('src/investigation-hint.mjs','scripts/acceptance/investigation-guidance-hook.mjs');
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,hash(await readFile(p,'utf8'))])));
const jobs=packed?[{task:'policy',arm:'bare',repeat:0},{task:'policy',arm:'jev',repeat:0},{task:'policy',arm:'jev',repeat:1},{task:'policy',arm:'bare',repeat:1}]:guided?['local','bare','jev'].map(arm=>({task:'policy',arm})):[...['bare','jev','local'].map(arm=>({task:'policy',arm})),...['local','jev','bare'].map(arm=>({task:'cursor',arm}))];
const protocol={at:new Date().toISOString(),runs:jobs.length,jobs,model:'gpt-6-astra',effort:'high',sourceHashes,fixtures:investigationTasks.map(t=>({id:t.id,prompt:t.prompt,hash:hash(t.files)})),scope:'Two new synthetic tasks, three arms, one execution per cell. Fixed Astra high to isolate read-only investigation; no desktop routing, forced MCP use or skill-read prerequisite. Local and Jev arms have identical tool definitions; local disables semantic judgments. Tool adoption, source rereads, model generations, Jev usage and native task time are observed. Not stable speed, desktop UI latency, full-combination acceptance or subscription billing proof.',stopRule:'Stop on first functional, infrastructure, timeout or model error. No retries, replacements or excluded runs. Preserve every attempt. At most six paid native tasks, 120 seconds each; each investigation at most two Jev requests under existing operation/task guards.',timeLimitMs:120000};
if(guided){protocol.scope='Development follow-up after tool-only non-adoption: same previously used policy fixture, three arms, one execution per arm, fixed Astra high. Assisted arms receive the actual production metadata-gated hint through a native UserPromptSubmit hook; task prompt is identical and no evidence is precomputed or injected. Hint transport is a benchmark wrapper; production bridge capability check was separately validated. No desktop effort routing. Not held-out, stable speed, full-combination acceptance or billing proof.';protocol.stopRule='At most three native tasks, 120 seconds each. Stop at first functional, model, infrastructure or timeout failure. Keep all prior unsuccessful/non-adopting runs separate; no replacement.';}
if(packed){protocol.scope='Development AB/BA after reversible shared-line projection. Same previously used policy fixture and evaluator; two repeats, fixed Astra high, sequential. Candidate uses the real native prompt hook and MCP investigation; no forced calls or precomputed evidence. No desktop effort routing. Prior non-adoption, timeout and negative guided results remain separate. Not held-out or stable/general/full-combination savings evidence.';protocol.stopRule='At most four native tasks, 120 seconds each. Stop at first functional, infrastructure, model or timeout failure, retain all attempts, no replacement.';}
if(!execute){console.log(JSON.stringify(protocol,null,2));process.exit(0);}
await mkdir(out,{recursive:true});await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
const bin=discoverCodex(),key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
let stopping=false,cancel=()=>{};for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;cancel();});
const records=[];
for(const job of jobs){
  if(stopping)break;
  const id=`${job.task}-${job.arm}${job.repeat===undefined?'':'-'+job.repeat}`,dir=join(out,id);await mkdir(dir);
  const cwd=await mkdtemp(join(tmpdir(),'jev-delegation-case-')),home=await mkdtemp(join(tmpdir(),'jev-delegation-native-'));
  const task=investigationTasks.find(t=>t.id===job.task),record={id,...job,startedAt:new Date().toISOString(),usage:[],timeline:[],completedItems:[],errors:[],status:'starting',preparationMs:0,model:protocol.model};
  for(const [name,value]of Object.entries(task.files)){await mkdir(dirname(join(cwd,name)),{recursive:true});await writeFile(join(cwd,name),value);}
  const store=new Store({home:join(dir,'private')}),pilot=new Pilot({store,key});
  let child,lines,timer,t0,client,finished,preparationStart;
  try{
    store.put('global','config',{enabled:job.arm!=='local',cacheMs:0},'settings');
    await symlink(join(homedir(),'.codex/auth.json'),join(home,'auth.json'));
    const catalog=JSON.parse(await readFile(join(homedir(),'.codex/models_cache.json'),'utf8'));await writeFile(join(home,'models.json'),JSON.stringify({models:catalog.models}));
    const env={...process.env,CODEX_HOME:home};for(const k of ['CODEX_THREAD_ID','CODEX_SESSION_ID','CODEX_CLI_PATH','TYPESAFE_API_KEY','JEV_PILOT_HOME'])delete env[k];
    const args=['app-server','-c',`model_catalog_json=${JSON.stringify(join(home,'models.json'))}`];
    if(job.arm!=='bare'){
      await writeFile(join(store.home,'.env.local'),'TYPESAFE_API_KEY='+key+'\n',{mode:0o600});
      env.JEV_PILOT_HOME=store.home;env.JEV_PILOT_BROWSER_PROXY_REPAIR='0';
      args.push('-c',`mcp_servers.jev-pilot=${toml({command:process.execPath,args:['--use-env-proxy',resolve('src/server.mjs')],env_vars:['JEV_PILOT_HOME','JEV_PILOT_BROWSER_PROXY_REPAIR','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY']})}`);
      if(guided){
        const hook=resolve('scripts/acceptance/investigation-guidance-hook.mjs');
        args.push('-c',`hooks.UserPromptSubmit=${toml([{hooks:[{type:'command',command:JSON.stringify(process.execPath)+' '+JSON.stringify(hook),timeout:2}]}])}`);
        const probe=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});probe.stderr.resume();
        const input=createInterface({input:probe.stdout});let serial=0;const pending=new Map();
        input.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.no(Error('HOOK_PROBE_RPC')):p.yes(m.result);}});
        const request=(method,params)=>new Promise((yes,no)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);no(Error('HOOK_PROBE_TIMEOUT'));},10000);pending.set(id,{yes,no,timer});probe.stdin.write(JSON.stringify({id,method,params})+'\n');});
        try{
          await request('initialize',{clientInfo:{name:'investigation_hook_probe',version:'1'},capabilities:{experimentalApi:true}});probe.stdin.write(JSON.stringify({method:'initialized'})+'\n');
          const listed=await request('hooks/list',{cwds:[cwd]}),trust={};
          const collect=x=>{if(!x||typeof x!=='object')return;if(x.key&&x.currentHash&&x.source==='sessionFlags'&&(x.command??x.handler?.command??'').includes(hook))trust[x.key]={enabled:true,trusted_hash:x.currentHash};for(const v of Object.values(x))if(v&&typeof v==='object')Array.isArray(v)?v.forEach(collect):collect(v);};collect(listed);
          if(Object.keys(trust).length!==1)throw Error('HOOK_TRUST_MISMATCH');
          args.push('-c',`hooks.state=${toml(trust)}`);
        }finally{for(const p of pending.values())clearTimeout(p.timer);input.close();probe.kill();}
      }
    }
    const startup=performance.now();child=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});child.stderr.resume();
    let serial=0;const pending=new Map();let resolveDone;const done=new Promise(r=>resolveDone=r);
    client={request:(method,params)=>new Promise((yes,no)=>{const id=++serial;const wait=setTimeout(()=>{pending.delete(id);no(Error('RPC_TIMEOUT'));},30000);pending.set(id,{yes,no,wait});child.stdin.write(JSON.stringify({id,method,params})+'\n');})};
    lines=createInterface({input:child.stdout});
    lines.on('line',s=>{let m;try{m=JSON.parse(s);}catch{return;}
      if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){clearTimeout(p.wait);pending.delete(m.id);m.error?p.no(Error('RPC_ERROR')):p.yes(m.result);}return;}
      if(m.id!==undefined){child.stdin.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Unexpected interaction'}})+'\n');return;}
      if(m.params?.threadId!==record.threadId)return;
      const entry=timelineEntry(m,performance.now()-t0);if(entry)record.timeline.push(entry);
      if(m.method==='turn/started')record.turnId=m.params.turn.id;
      if(m.method==='item/completed')record.completedItems.push(m.params.item);
      if(m.method==='thread/tokenUsage/updated'){record.usage.push(m.params.tokenUsage);void writeFile(join(dir,'usage-latest.json'),JSON.stringify(m.params.tokenUsage));}
      if(m.method==='error')record.errors.push(m.params.error?.message??'runtime error');
      if(m.method==='turn/completed'){nativeTerminal(record,m.params.turn.status);resolveDone();}
    });
    child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.wait);p.no(Error('NATIVE_EXIT'));}pending.clear();if(!finished){record.status='native_exit';resolveDone();}});
    await client.request('initialize',{clientInfo:{name:'jev_delegation_benchmark',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    const thread=await client.request('thread/start',{model:protocol.model,cwd,runtimeWorkspaceRoots:[cwd],ephemeral:true,sandbox:'workspace-write',approvalPolicy:'never',config:{'features.apps':false,'features.multi_agent':false,web_search:'disabled','hooks.Stop':[]},developerInstructions:'Complete the task inside this workspace. Choose available tools as appropriate; avoid unnecessary reads. No browsing, other projects, credentials, subagents, deletion or questions. Preserve source files. Write the requested deliverables and verify them. Final reply should be concise.'});
    record.threadId=thread.thread.id;record.returnedModel=thread.model;if(thread.model!==protocol.model)throw Error('MODEL_CHANGED');
    for(let i=0;i<50;i++){
      record.mcpStatus=await client.request('mcpServerStatus/list',{threadId:record.threadId,limit:100});
      if(job.arm==='bare'||record.mcpStatus.data?.some(x=>Object.keys(x.tools??{}).some(k=>k.includes('jev_evidence'))))break;
      await new Promise(r=>setTimeout(r,100));
    }
    const ready=record.mcpStatus.data?.some(x=>Object.keys(x.tools??{}).some(k=>k.includes('jev_evidence')));
    if(job.arm==='bare'?(record.mcpStatus.data??[]).some(x=>Object.keys(x.tools??{}).length):!ready)throw Error('MCP_CONFIGURATION_MISMATCH');
    record.startupMs=performance.now()-startup;
    cancel=()=>{stopTask(record,'signal');if(record.turnId)void client.request('turn/interrupt',{threadId:record.threadId,turnId:record.turnId}).catch(()=>{});resolveDone();};
    t0=performance.now();timer=setTimeout(()=>{stopTask(record,'deadline');cancel();},protocol.timeLimitMs);
    record.timeline.push({method:'turn/start:sent',elapsedMs:0});await client.request('turn/start',{threadId:record.threadId,model:protocol.model,effort:protocol.effort,input:[{type:'text',text:task.prompt}]});
    await done;clearTimeout(timer);record.nativeMs=performance.now()-t0;record.endToEndMs=record.preparationMs+record.nativeMs;record.quality=await validateInvestigation(task,cwd);record.passed=record.status==='completed'&&record.quality.pass;
    record.artifacts={};for(const name of (task.id==='policy'?['answer.json','answer.md']:['src/poller.mjs','regression.test.mjs','diagnosis.md']))record.artifacts[name]=await readFile(join(cwd,name),'utf8').catch(()=>'');
  }catch(e){if(preparationStart!==undefined&&!record.preparationMs)record.preparationMs=performance.now()-preparationStart;record.status='failed';record.error=e.code??e.message;record.passed=false;record.nativeMs=t0?performance.now()-t0:null;record.endToEndMs=record.nativeMs===null?null:record.preparationMs+record.nativeMs;}
  finally{
    finished=true;clearTimeout(timer);cancel=()=>{};lines?.close();
    if(child&&child.exitCode===null&&child.signalCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();let wait;await Promise.race([closed,new Promise(r=>wait=setTimeout(()=>{child.kill('SIGKILL');r();},3000))]);clearTimeout(wait);}
    record.tokens=record.usage.at(-1)?.total??null;record.jevEvents=store.events(store.project(cwd),10000);pilot.close();
    const body=JSON.stringify(record,null,2);if(body.includes(key))throw Error('SECRET_IN_RECORD');await writeFile(join(dir,'run.json'),body);
  }
  records.push(record);await writeFile(join(out,'results.json'),JSON.stringify({protocol,records},null,2));console.log(JSON.stringify({id,passed:record.passed,status:record.status,error:record.error,nativeMs:record.nativeMs,preparationMs:record.preparationMs,tokens:record.tokens?.totalTokens}));
  if(!record.passed||record.errors.length){await writeFile(join(out,'stop.json'),JSON.stringify({id,reason:record.error??record.status}));process.exitCode=2;break;}
}
