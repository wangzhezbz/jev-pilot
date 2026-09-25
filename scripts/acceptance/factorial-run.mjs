// Opt-in paid benchmark. Real Codex models and Jev; synthetic workspaces only.
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {runBridge,hookOverrides,toml} from '../../runtime/desktop/bridge.mjs';
import {effortQuestion} from '../../runtime/desktop/router.mjs';
import {Store,hash,loadKey} from '../../src/core.mjs';
import {installHome,discoverCodex} from '../../src/setup.mjs';
import {tasks,validate} from './factorial-tasks.mjs';
import {semanticTask,validateSemantic} from './semantic-task.mjs';
import {holdoutTasks,validateHoldout} from './holdout-tasks.mjs';
import {retryTask,validateRetry} from './retry-task.mjs';
import {homedir} from 'node:os';
import {timelineEntry} from './timeline.mjs';
import {stopTask,nativeTerminal} from './terminal-state.mjs';
if(!process.argv.includes('--run')&&!process.argv.includes('--plan'))throw Error('Explicit --run required: real model usage');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'dist/factorial-20260924');
await mkdir(out,{recursive:true});
const bin=discoverCodex(),key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const holdout=process.argv.includes('--holdout');
const holdoutCase=process.argv.find(x=>x.startsWith('--holdout-case='))?.slice(15);
const holdoutRepeats=Number(process.argv.find(x=>x.startsWith('--holdout-repeats='))?.slice(18)??1);
if((holdoutCase&&!holdoutTasks.some(t=>t.id===holdoutCase))||![1,2].includes(holdoutRepeats)||(!holdout&&(holdoutCase||holdoutRepeats!==1)))throw Error('INVALID_HOLDOUT_SELECTION');
const matched=process.argv.includes('--matched-routing');
const releaseAB=process.argv.includes('--release-ab')||matched;
const candidateRoot=process.argv.find(x=>x.startsWith('--candidate-root='))?.slice(17);
if(candidateRoot&&!releaseAB)throw Error('CANDIDATE_REQUIRES_RELEASE_AB');
const candidateVersion=candidateRoot?JSON.parse(await readFile(join(candidateRoot,'.codex-plugin/plugin.json'),'utf8')).version:null;
const modelOverride=process.argv.find(x=>x.startsWith('--model='))?.slice(8);
if(modelOverride&&!['gpt-6-astra','gpt-6-sol','gpt-6-luna'].includes(modelOverride))throw Error('INVALID_MODEL');
const models=[modelOverride||(releaseAB?'gpt-6-astra':'gpt-6-sol')],jobs=[];
const semantic=process.argv.includes('--semantic-local');
const caseIds=process.argv.find(x=>x.startsWith('--case-ids='))?.slice(11).split(',');
if(caseIds&&(!releaseAB||!caseIds.length||caseIds.some(id=>!['cross_file','incident','semantic','repository'].includes(id))||new Set(caseIds).size!==caseIds.length))throw Error('INVALID_CASE_IDS');
const selectedTasks=holdout?holdoutTasks.filter(t=>!holdoutCase||t.id===holdoutCase):matched?[retryTask]:(releaseAB?[...tasks.filter(t=>['cross_file','incident'].includes(t.id)||caseIds?.includes(t.id)),semanticTask]:semantic?[semanticTask]:tasks).filter(t=>!caseIds||caseIds.includes(t.id));
const orders=[['bare','routing','evidence','combined'],['evidence','bare','combined','routing'],['combined','evidence','routing','bare']];
if(matched){for(let repeat=0;repeat<2;repeat++)jobs.push({model:models[0],task:'retry_contract',repeat,arms:repeat?['adaptive','fixed_medium','fixed_high']:['fixed_high','fixed_medium','adaptive']});}
else if(releaseAB){for(let repeat=0;repeat<(holdout?holdoutRepeats:2);repeat++)for(const [i,task]of selectedTasks.entries())jobs.push({model:models[0],task:task.id,repeat,arms:(repeat+i)%2?['combined','bare']:['bare','combined']});}
else for(const task of selectedTasks)jobs.push({model:models[0],task:task.id,repeat:0,arms:semantic?(process.argv.includes('--candidate-only')?['evidence']:['bare','evidence']):orders[jobs.length]});
const runCount=jobs.reduce((n,j)=>n+j.arms.length,0);
const evidenceArm=arm=>['evidence','combined','fixed_high','fixed_medium','adaptive'].includes(arm);
const config={'features.apps':false,'features.multi_agent':false,web_search:'disabled','hooks.Stop':[]};
const common='Complete the task inside the current working directory only. Use local file and shell tools as needed. No unrelated projects, credentials, browsing, subagents, deletion, or changes to existing tests. The supplied Jev tool may contact its service. Do not ask questions. Write the requested deliverables and run relevant local checks. Final response: concise factual summary with verification results.';
const skill=await readFile('skills/jev-pilot/SKILL.md','utf8'),reference=await readFile('skills/jev-pilot/references/operations.md','utf8');
const disableArgs=[];
const hashes={};for(const path of ['src/core.mjs','src/request-guard.mjs','src/automation.mjs','src/evidence.mjs','src/policy.mjs','runtime/desktop/router.mjs','runtime/desktop/bridge.mjs','skills/jev-pilot/SKILL.md','skills/jev-pilot/references/operations.md','scripts/benchmark/tasks.mjs','scripts/acceptance/tasks.mjs','scripts/acceptance/factorial-run.mjs','scripts/acceptance/factorial-tasks.mjs','src/prepare-output.mjs','src/log-projection.mjs','src/evidence-tool.mjs','src/server.mjs','src/runtime-compatibility.mjs','skills/jev-pilot/references/evidence.md','scripts/acceptance/timeline.mjs','scripts/acceptance/terminal-state.mjs','src/distribution.mjs','src/investigation-hint.mjs'])hashes[path]=hash(await readFile(path,'utf8'));
const protocol={at:new Date().toISOString(),jobs,runs:runCount,models,initialEffort:'high',concurrency:1,hashes,config,quality:'Frozen independent oracle after inference; protected fixtures unchanged; failed attempts retained.',stopRule:'Stop on infrastructure or provider rate/quota error, no substitution or retries.',timeLimitMs:240000,nativeVersion:spawnSync(bin,['--version'],{encoding:'utf8'}).stdout.trim(),revision:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),expectedPluginVersion:releaseAB?'0.2.0+codex.20260924011258':semantic?'workspace-candidate':'0.2.0+codex.20260923233124',scope:'12 single-replicate diagnostic runs, synthetic workspaces, GPT-6 Sol initially high (desktop user baseline). Bare: native engine. Routing: real router without plugin or automation. Evidence: plugin and automatic evidence hook, fixed keep router control with no routing API calls. Combined: real router, plugin and automation. All use clean private CODEX_HOME, same prompt and native code mode; independent oracle; no forced Jev calls or full reads. Orders predefined, not completely balanced with three tasks. Startup separately measured. Native app-server backend timing, not desktop UI latency or account billing. No statistical or guaranteed savings claim. Main session background routing excluded. Failures retained. No post-result policy changes.' ,tasks:selectedTasks.map(t=>({id:t.id,prompt:t.prompt,files:Object.fromEntries(Object.entries(t.files).map(([k,v])=>[k,hash(v)]))}))};
if(releaseAB){protocol.scope='Frozen installed v16, GPT-6 Astra initially high. 3 tasks x 2 repeats x bare/combined = 12 real tasks, sequential, AB/BA balanced within each task. No mandated Jev or full reads. Equal prompts, frozen independent quality oracles, startup separate. Native desktop backend timing, not UI or subscription debits; small exploratory sample.';protocol.stopRule='Stop after infrastructure failure, timeout, interruption or provider limit; retain all prior and failed runs. No reruns or mid-test product changes.';protocol.hashes['scripts/acceptance/semantic-task.mjs']=hash(await readFile('scripts/acceptance/semantic-task.mjs','utf8'));}
if(candidateRoot){protocol.expectedPluginVersion=candidateVersion;protocol.sourceMode='isolated staged candidate plugin plus matching workspace bridge';protocol.scope=protocol.scope.replace('installed v16','candidate v17');}
if(caseIds){protocol.caseIds=caseIds;protocol.scope=`Frozen candidate entry follow-up: ${selectedTasks.length} tasks x 2 repeats x bare/combined = ${runCount} real tasks. GPT-6 Astra high, sequential balanced AB/BA; same frozen task inputs and oracle. No forced Jev or full reads. Original v17 campaign remains separate. Backend time and model usage, not UI latency or billed quotas.`;}
if(matched){if(!candidateRoot||caseIds)throw Error('MATCHED_REQUIRES_CANDIDATE_NO_CASE_OVERRIDE');protocol.initialEffort='high except fixed_medium';protocol.hashes['scripts/acceptance/retry-task.mjs']=hash(await readFile('scripts/acceptance/retry-task.mjs','utf8'));protocol.scope='Six matched-entry runs on a new retry-contract task: fixed high, fixed medium, adaptive high, reverse order on repeat. Same model, installed plugin, tool descriptions, automation and instructions. Only initial effort/routing differs; evidence calls remain possible and must be accounted. No forced delegation. Two repetitions are exploratory, not stable speed or quality proof.';}
if(modelOverride){protocol.scope=protocol.scope.replaceAll('GPT-6 Astra','GPT-6 '+modelOverride.slice(6));}
if(candidateRoot){protocol.candidateRoot=candidateRoot;protocol.policyVersion=(await import('../../runtime/desktop/router.mjs')).POLICY_VERSION??null;protocol.scope=protocol.scope.replace(/candidate v17|installed v16/g,'candidate '+candidateVersion);}
if(holdout){if(!releaseAB||matched||caseIds||semantic)throw Error('HOLDOUT_REQUIRES_PLAIN_RELEASE_AB');protocol.hashes['scripts/acceptance/holdout-tasks.mjs']=hash(await readFile('scripts/acceptance/holdout-tasks.mjs','utf8'));protocol.scope='Frozen v19 holdout: four previously unused synthetic code/document tasks, one pair each, balanced AB/BA across cases, eight sequential paid native tasks. Same Astra high baseline and independent oracle. No strategy edits, retries or post-result task replacement. Exploratory, no stable or account-billing claim.';}
if(holdout&&(holdoutCase||holdoutRepeats!==1)){protocol.scope=`Targeted regression follow-up on ${selectedTasks.length} existing holdout case(s), ${holdoutRepeats} repeats, ${runCount} sequential paid tasks, AB/BA. These cases are now known optimization fixtures, not a fresh holdout. Native bare versus frozen candidate, same initial model effort and independent oracle. Previous negative results remain separate; no reruns, substitutions, quota resets or product edits during this campaign. Exploratory, not a stable savings or billing claim.`;}
if(process.argv.includes('--plan')){console.log(JSON.stringify(protocol,null,2));process.exit(0);}
if(semantic)protocol.scope='Exploratory natural semantic tasks (arms listed in jobs): native bare vs local candidate skill and MCP with fixed high routing control. No mandated Jev calls or full reads; no performance significance or billing claim.';
await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
function client(input,output){
 let id=0;const pending=new Map(),listeners=[];const lines=createInterface({input:output});
 lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(Error('RPC_ERROR')):p.yes(m.result);}}else if(m.id!==undefined)input.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Unexpected interaction'}})+'\n');else for(const f of listeners)f(m);});
 return {listeners,request:(method,params)=>new Promise((yes,no)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);no(Error('RPC_TIMEOUT'));},30000);pending.set(n,{yes,no,timer});input.write(JSON.stringify({id:n,method,params})+'\n');}),notify:method=>input.write(JSON.stringify({method})+'\n'),close:()=>{lines.close();for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('CLOSED'));}pending.clear();}};
}
async function init(c){await c.request('initialize',{clientInfo:{name:'jev_current_benchmark',version:'1'},capabilities:{experimentalApi:true}});c.notify('initialized');}
let stopping=false;let cancelTurn=()=>{};for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;cancelTurn();});
async function stopChild(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;const done=new Promise(r=>p.once('close',r));p.kill();let timer;await Promise.race([done,new Promise(r=>timer=setTimeout(()=>{p.kill('SIGKILL');r();},3000))]);clearTimeout(timer);}
const records=[];
runs: for(const job of jobs)for(const arm of job.arms){
 if(stopping)break runs;
 const id=`${job.model}-${job.task}-${job.repeat}-${arm}`,dir=join(out,id);await mkdir(dir);
 const cwd=await mkdtemp(join(tmpdir(),'jev-current-ab-')),task=selectedTasks.find(t=>t.id===job.task);
 for(const [name,value]of Object.entries(task.files)){await mkdir(dirname(join(cwd,name)),{recursive:true});await writeFile(join(cwd,name),value);}
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
  if(evidenceArm(arm)){
   await writeFile(join(store.home,'.env.local'),'TYPESAFE_API_KEY='+key+'\n',{mode:0o600});
   if(semantic){
    await mkdir(join(cleanHome,'skills'),{recursive:true});await symlink(resolve('skills/jev-pilot'),join(cleanHome,'skills/jev-pilot'));
    args.push('-c',`mcp_servers.jev-pilot=${toml({command:process.execPath,args:['--use-env-proxy',resolve('src/server.mjs')],env_vars:['JEV_PILOT_HOME','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY']})}`);
    record.pluginVersion='workspace-candidate';
   }else{
   let marketplace='personal';
   if(candidateRoot){
    marketplace='jev-candidate';const root=join(cleanHome,'candidate-marketplace');await mkdir(join(root,'.agents/plugins'),{recursive:true});await mkdir(join(root,'plugins'));await symlink(candidateRoot,join(root,'plugins/jev-pilot'));
    await writeFile(join(root,'.agents/plugins/marketplace.json'),JSON.stringify({name:marketplace,plugins:[{name:'jev-pilot',source:{source:'local',path:'./plugins/jev-pilot'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'}}]}));
    const added=spawnSync(bin,['plugin','marketplace','add',root,'--json'],{env,encoding:'utf8',timeout:30000});if(added.status!==0)throw Error('CANDIDATE_MARKETPLACE_FAILED');
   }
   const install=spawnSync(bin,['plugin','add',`jev-pilot@${marketplace}`,'--json'],{env,encoding:'utf8',timeout:30000});if(install.status!==0)throw Error('PLUGIN_INSTALL_FAILED');record.pluginVersion=JSON.parse(install.stdout).version;if(record.pluginVersion!==protocol.expectedPluginVersion)throw Error('PLUGIN_VERSION_DRIFT');
   }
  }
  if(arm==='bare'){native=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});native.stderr.resume();c=client(native.stdin,native.stdout);}
  else {
  bridge=await runBridge({realBin:bin,args,nativeVersion:protocol.nativeVersion,trust,input,output,env:{...env,TYPESAFE_API_KEY:key},keyPath:join(installHome(),'.env.local'),logPath:join(dir,'routing.jsonl'),automation:evidenceArm(arm)?{store,key}:false,
    ...(['evidence','fixed_high','fixed_medium'].includes(arm)?{judge:async()=>({answer:{type:'choice',choice:'keep',confidence:1,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k==='keep'?1:0]))},model:'fixed-control-no-api',inputTokens:0,outputTokens:0})}:{})});
  bridge.child.stderr.unpipe(process.stderr);bridge.child.stderr.resume();c=client(input,output);}
  await init(c);
  const thread=await c.request('thread/start',{model:job.model,cwd,runtimeWorkspaceRoots:[cwd],ephemeral:true,sandbox:'workspace-write',approvalPolicy:'never',config,developerInstructions:common});record.threadId=thread.thread.id;
  const readyUntil=Date.now()+20000;
  do {
   const status=await c.request('mcpServerStatus/list',{threadId:record.threadId,limit:100});
   record.mcpServers=(status.data??[]).map(x=>({name:x.name,tools:Object.keys(x.tools??{}),error:x.error}));
   const active=record.mcpServers.filter(x=>x.tools.length);
   if(active.some(x=>x.name!=='jev-pilot'))throw Error('UNEXPECTED_MCP');
   if(!evidenceArm(arm)&&active.length)throw Error('CONTAMINATED_CONTROL');
   if(!evidenceArm(arm)||active.length===1)break;
   await new Promise(r=>setTimeout(r,200));
  }while(Date.now()<readyUntil);
  if(evidenceArm(arm)&&!record.mcpServers.some(x=>x.name==='jev-pilot'&&JSON.stringify([...x.tools].sort())===JSON.stringify(['jev_evidence','jev_pilot'])))throw Error('MCP_NOT_READY');
  record.startupMs=Math.round(performance.now()-initAt);record.completedItems=[];record.timeline=[];
  let complete;const done=new Promise(r=>complete=r);c.listeners.push(m=>{const p=m.params;if(p?.threadId!==record.threadId)return;const stamp=timelineEntry(m,performance.now()-t0);if(stamp)record.timeline.push(stamp);if(m.method==='item/completed')record.completedItems.push(p.item);if(m.method==='turn/started')record.turnId=p.turn.id;if(m.method==='thread/tokenUsage/updated')record.usage.push(p.tokenUsage);if(m.method==='error')record.errors.push(p.error?.message||'runtime error');if(m.method==='thread/tokenUsage/updated')void writeFile(join(dir,'usage-latest.json'),JSON.stringify(p.tokenUsage));if(m.method==='turn/completed'){nativeTerminal(record,p.turn.status);complete();}});
  cancelTurn=()=>{stopTask(record,'signal');if(record.turnId)c.request('turn/interrupt',{threadId:record.threadId,turnId:record.turnId}).catch(()=>{});complete();};
  t0=performance.now();timer=setTimeout(()=>{stopTask(record,'deadline');if(record.turnId)c.request('turn/interrupt',{threadId:record.threadId,turnId:record.turnId}).catch(()=>{});complete();},240000);
  record.timeline.push({method:'turn/start:sent',elapsedMs:0});await c.request('turn/start',{threadId:record.threadId,model:job.model,effort:arm==='fixed_medium'?'medium':'high',input:[{type:'text',text:task.prompt}]});record.timeline.push({method:'turn/start:acknowledged',elapsedMs:performance.now()-t0});await done;clearTimeout(timer);
  record.wallMs=Math.round(performance.now()-t0);record.tokens=record.usage.at(-1)?.total??null;record.quality=await (holdout?validateHoldout:task.id==='retry_contract'?validateRetry:task.id==='semantic'?validateSemantic:validate)(task,cwd);record.passed=record.status==='completed'&&record.quality.pass;
  await bridge?.flushLog(); await bridge?.flushAutomation?.();
  record.jevEvents=store.events(store.project(cwd),10000);record.totalMs=record.startupMs+record.wallMs;
  record.artifacts={};const modified=spawnSync('git',['diff','--name-only'],{cwd,encoding:'utf8'}).stdout.trim().split('\n').filter(Boolean);const added=spawnSync('git',['ls-files','--others','--exclude-standard'],{cwd,encoding:'utf8'}).stdout.trim().split('\n').filter(Boolean);record.changedPaths={modified,added};for(const name of [...new Set([...modified,...added])])try{record.artifacts[name]=await readFile(join(cwd,name),'utf8');}catch{}
 }catch(e){record.tokens=record.usage.at(-1)?.total??null;record.status='infrastructure_error';record.error=e.code||e.message;record.passed=false;record.wallMs=t0?Math.round(performance.now()-t0):null;}
 finally{
  clearTimeout(timer);await bridge?.flushLog();await bridge?.flushAutomation?.();if(store&&!record.jevEvents)record.jevEvents=store.events(store.project(cwd),10000);c?.close();pc?.close();await stopChild(probe);await stopChild(native);await stopChild(bridge?.child);await bridge?.cleanup();await bridge?.flushLog();cancelTurn=()=>{};if(!evidenceArm(arm))store?.close();
  for(const k of ['SIGTERM','SIGINT'])for(const fn of process.listeners(k))if(!before[k].has(fn))process.removeListener(k,fn);
  record.routing=await readFile(join(dir,'routing.jsonl'),'utf8').then(s=>s.trim().split('\n').filter(Boolean).map(JSON.parse)).catch(()=>[]);
  if(releaseAB){const external=new Store();try{record.externalJevEvents=external.events(external.project(cwd),10000);}finally{external.close();}}
  const serialized=JSON.stringify(record,null,2);if(serialized.includes(key))throw Error('SECRET_IN_RECORD');await writeFile(join(dir,'run.json'),serialized);
 }
 records.push(record);await writeFile(join(out,'results.json'),JSON.stringify({protocol,records},null,2));await writeFile(join(out,'progress.json'),JSON.stringify({planned:runCount,completed:records.length,results:records.map(r=>({id:r.id,passed:r.passed,status:r.status}))},null,2));
 console.log(JSON.stringify({id,passed:record.passed,status:record.status,wallMs:record.wallMs,tokens:record.tokens?.totalTokens,changes:record.routing.filter(e=>['applied','start_forwarded'].includes(e.status)).length}));
 if(['infrastructure_error','timeout','interrupted'].includes(record.status)||record.errors.some(e=>/usage limit|rate limit|quota/i.test(e))){await writeFile(join(out,'stop.json'),JSON.stringify({reason:'infrastructure_or_provider_limit',id,status:record.status,error:record.error,errors:record.errors}));process.exitCode=2;break runs;}
 if(process.exitCode)break;
}
await writeFile(join(out,'results.json'),JSON.stringify({protocol,records},null,2));
