import { realpathSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { readFile, mkdir, mkdtemp, chmod, appendFile, unlink, rmdir, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { Router, makeJudge, POLICY_VERSION, LEASE_UNIT, isContinuation } from './router.mjs';
import { Store, Judge, loadConfig } from '../../src/core.mjs';

export function toml(value) {
  if(value===null || value===undefined) throw new Error('TOML_NULL');
  if(Array.isArray(value)) return '['+value.map(toml).join(',')+']';
  if(typeof value==='object') return '{'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+'='+toml(v)).join(',')+'}';
  return JSON.stringify(value);
}
export function hookOverrides(node, hookPath, trust={}) {
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const command=process.platform==='win32' ? `"${node.replaceAll('"', '')}" "${hookPath.replaceAll('"', '')}"` : `${quote(node)} ${quote(hookPath)}`;
  const hooks={UserPromptSubmit:[{hooks:[{type:'command',command,timeout:12}]}],
    PostToolUse:[{matcher:'.*',hooks:[{type:'command',command,timeout:12}]}]};
  const result=Object.entries(hooks).flatMap(([k,v])=>['-c',`hooks.${k}=${toml(v)}`]);
  if(Object.keys(trust).length) result.push('-c',`hooks.state=${toml(Object.fromEntries(Object.entries(trust).map(([key,hash])=>[key,{enabled:true,trusted_hash:hash}])) )}`);
  return result;
}

export function runtimeFingerprint(hashes) {
  if(!hashes || typeof hashes!=='object' || Array.isArray(hashes) || !Object.keys(hashes).length)return null;
  return createHash('sha256').update(JSON.stringify(Object.entries(hashes).sort(([a],[b])=>a<b?-1:a>b?1:0))).digest('hex');
}
export function metadataLoader({request,accept,log,clock=Date.now}) {
  let ready=false,pending=null,attempt=0,nextAt=0,unsupported=false;
  return async()=>{
    if(ready||unsupported||clock()<nextAt)return;
    if(pending)return pending;
    pending=(async()=>{
      attempt++;
      try {
        const result=await request('model/list',{includeHidden:true,limit:100},1500);
        if(!Array.isArray(result?.data)||!result.data.length
          ||result.data.some(m=>typeof m.model!=='string'||!Array.isArray(m.supportedReasoningEfforts)))throw new Error('INVALID_METADATA');
        accept(result.data);ready=true;
        log({kind:'metadata_loaded',attempt,models:result.data.length});
      }catch(error){
        unsupported=error.rpcCode===-32601||error.rpcCode===-32602;
        const code=unsupported?'METADATA_UNSUPPORTED':error.message==='TIMEOUT'?'METADATA_TIMEOUT':error.message==='INVALID_METADATA'?'METADATA_INVALID':'METADATA_RPC_ERROR';
        nextAt=clock()+Math.min(60000,5000*2**Math.min(attempt-1,4));
        log({kind:'metadata_unavailable',code,attempt,retryOnNextTurn:!unsupported,retryAfterMs:unsupported?null:nextAt-clock()});
      }
    })().finally(()=>{pending=null;});
    return pending;
  };
}
// Enable only on the exact engine whose transport and compaction were tested.
// Native Codex still decides provider/model support and owns history updates.
export function effortTransportFlags(version,args=[]) {
  const explicit=args.some(x=>typeof x==='string' && /(?:^|[=,\s])(?:features\.)?reasoning_effort_override(?:[=,\s]|$)/.test(x));
  return ['codex-cli 0.155.0-alpha.16.3','codex-cli 0.155.0-alpha.16.4'].includes(version)&&!explicit?['--enable','reasoning_effort_override']:[];
}
export async function runBridge({realBin,args,nativeVersion=null,trust={},keyPath,logPath,judge,automation=false,runtimeIdentity=null,input=process.stdin,output=process.stdout,env=process.env}={}) {
  const home=dirname(fileURLToPath(import.meta.url));
  const dir=await mkdtemp(join(tmpdir(),'jev-bridge-'));await chmod(dir,0o700);
  const socketPath=process.platform==='win32'?`\\\\.\\pipe\\jev-pilot-${randomUUID()}`:join(dir,'hook.sock');
  let assistant=null;
  if(automation)try{const {createAutomation}=await import('../../src/automation.mjs');assistant=createAutomation({...(typeof automation==='object'?automation:{}),evidenceAvailable:async threadId=>{
    try{const status=await request('mcpServerStatus/list',{threadId,limit:100},150);return status.data?.some(s=>Object.keys(s.tools??{}).some(name=>/(?:^|__)jev_evidence$/.test(name)))===true;}catch{return false;}
  }});}catch{}
  const prefix=`jev:${randomUUID()}:`;
  const pending=new Map(),clientRequests=new Map();let counter=0,closed=false;
  let logPending=Promise.resolve();
  const log=record=>{if(logPath){let projectId;try{const cwd=router.turns.get(record.threadId)?.cwd??router.threads.get(record.threadId)?.cwd;if(cwd)projectId=createHash('sha256').update(realpathSync(cwd)).digest('hex');}catch{}const line=JSON.stringify({at:new Date().toISOString(),bridgeId:prefix,pid:process.pid,projectId,measurementSource:env.JEV_PILOT_MEASUREMENT==='synthetic'?'synthetic':'runtime',...record})+'\n';
    logPending=logPending.then(()=>appendFile(logPath,line,{mode:0o600})).catch(()=>{});}};
  const childEnv={...env,JEV_BRIDGE_SOCKET:socketPath};
  // Keep the user's proxy on the backend too. MCP servers still require their
  // own explicit env_vars allowlist; stripping these here breaks that forwarding.
  delete childEnv.JEV_PROXY_ADDED;delete childEnv.JEV_NETWORK_MODE;
  delete childEnv.TYPESAFE_API_KEY;
  // Do not let shell tools recursively start this adapter through the override.
  delete childEnv.CODEX_CLI_PATH;
  const effortFlags=effortTransportFlags(nativeVersion,args);
  const child=spawn(realBin,[...args,...effortFlags,'--enable','step_model_switching',...hookOverrides(process.execPath,join(home,'hook.mjs'),trust)],
    {env:childEnv,stdio:['pipe','pipe','pipe']});
  const send=x=>{if(!closed) child.stdin.write(JSON.stringify(x)+'\n');};
  const request=(method,params,timeout=10_000)=>new Promise((resolve,reject)=>{
    if(closed) return reject(new Error('CLOSED'));
    const id=prefix+(++counter),timer=setTimeout(()=>{pending.delete(id);reject(new Error('TIMEOUT'));},timeout);
    pending.set(id,{resolve,reject,timer});send({id,method,params});
  });
  const guardStore = judge ? null : assistant?.store ?? new Store();
  const judgeFactory = (context, key) => {
    const project = guardStore.project(context.cwd || process.cwd());
    return new Judge({ store: guardStore, project, taskId: context.taskId, priority:context.priority, key,
      config: { ...loadConfig(guardStore, project), timeoutMs: 2000, cacheMs: 0 } });
  };
  const router=new Router({request,judge:judge??await makeJudge(keyPath,{env,judgeFactory}),log,groupToolBatches:true});
  const ensureMetadata=metadataLoader({request,log,accept:models=>{
    for(const m of models)router.supported.set(m.model,(m.supportedReasoningEfforts??[]).map(x=>x.reasoningEffort));
  }});
  const threadQueues=new Map();
  const server=createServer(socket=>{
    let data='';socket.setTimeout(11_000,()=>socket.destroy());
    socket.on('error',()=>{});
    socket.on('data',chunk=>{
      data+=chunk;if(Buffer.byteLength(data)>2_000_000) return socket.destroy();
      if(!data.includes('\n')) return;
      socket.pause();
      Promise.resolve().then(()=>{const payload=JSON.parse(data.slice(0,data.indexOf('\n')));if(assistant&&payload.cwd&&!assistant.enabled(payload.cwd)){router.stop(payload.session_id);return {};}return router.hook(payload);})
        .then(async r=>{let extra={};try{extra=await assistant?.hook(JSON.parse(data.slice(0,data.indexOf('\n'))))??{};}catch{}socket.end(JSON.stringify({...r,...extra})+'\n');},()=>socket.end('{}\n'));
    });
  });
  await new Promise((yes,no)=>server.once('error',no).listen(socketPath,yes));if(process.platform!=='win32')await chmod(socketPath,0o600);
  const toBackend=createInterface({input});
  toBackend.on('line',line=>{
    let msg;try{msg=JSON.parse(line);}catch{child.stdin.write(line+'\n');return;}
    if(msg.method && msg.id!==undefined) clientRequests.set(JSON.stringify(msg.id),{method:msg.method,params:msg.params});
    if(msg.method==='initialize') msg.params={...msg.params,capabilities:{...msg.params?.capabilities,experimentalApi:true}};
    const threadId=msg.params?.threadId;
    if(['turn/start','turn/steer','turn/interrupt'].includes(msg.method))assistant?.cancel?.(threadId);
    const starting=msg.method==='turn/start'?router.start(threadId,msg.params):null;
    if(msg.method==='turn/steer') router.invalidate(msg.params.threadId,msg.params.input);
    if(msg.method==='turn/interrupt') router.stop(msg.params.threadId);
    if(msg.method==='turn/settings/update' && msg.id!==undefined) {
      const requestState=clientRequests.get(JSON.stringify(msg.id));
      requestState.control=router.beginSettingsUpdate(msg.params);
    }
    // Keep control messages behind their pending start, while invalidating
    // recommendations immediately. Other threads and backend RPC replies flow.
    if(starting || (threadId && threadQueues.has(threadId))) {
      const job=(threadQueues.get(threadId)??Promise.resolve()).then(async()=>{
        if(starting){
          await ensureMetadata();const cwd=msg.params.cwd??router.threads.get(threadId)?.cwd;
          if(!assistant||!cwd||assistant.enabled(cwd)){
            if(assistant&&cwd&&(!starting.previousTurn||isContinuation(starting.task))){
              const revision=starting.revision;let timer;
              const previous=await Promise.race([assistant.resumeContext(cwd,threadId,starting.task).catch(()=>undefined),new Promise(resolve=>{timer=setTimeout(()=>resolve(undefined),150);})]).finally(()=>clearTimeout(timer));
              if(previous&&starting.active&&starting.revision===revision&&router.turns.get(threadId)===starting){
                starting.previousTurn=previous;
                log({kind:'resume_context',threadId,sourceTurnId:previous.sourceTurnId,changedFilesCount:previous.validation.changedFilesCount,requiresReview:true});
              }
            }
            msg.params=await router.routeStart(msg.params,starting);
          }else router.stop(threadId);
        }
        send(msg);
      }).catch(()=>{log({kind:'start_routing_fallback',threadId});send(msg);});
      threadQueues.set(threadId,job);
      job.finally(()=>{if(threadQueues.get(threadId)===job)threadQueues.delete(threadId);});
      return;
    }
    send(msg);
  });
  const fromBackend=createInterface({input:child.stdout});
  fromBackend.on('line',line=>{
    let msg;try{msg=JSON.parse(line);}catch{output.write(line+'\n');return;}
    if(typeof msg.id==='string' && msg.id.startsWith(prefix) && !msg.method){
      const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Object.assign(new Error('RPC_FAILED'),{rpcCode:Number.isInteger(msg.error.code)?msg.error.code:null})):p.resolve(msg.result);}return;
    }
    if(!msg.method && msg.id!==undefined){
      const p=clientRequests.get(JSON.stringify(msg.id));clientRequests.delete(JSON.stringify(msg.id));
      if(p?.control)router.finishSettingsUpdate(p.control,msg.result,msg.error);
      if(p?.method==='initialize' && !msg.error) {
        void ensureMetadata();
      }
      if(['thread/start','thread/resume'].includes(p?.method) && msg.result?.thread) {
        const r=msg.result;router.threads.set(r.thread.id,{model:r.model,effort:r.reasoningEffort,cwd:r.thread.cwd??p.params?.cwd});
      }
      if(p?.method==='turn/start' && msg.error){
        router.stop(p.params.threadId);log({kind:'start_rejected',threadId:p.params.threadId});
      }
    }
    if(msg.method){router.observe(msg);try{if(assistant?.checkpointRelevant(msg)){const t=router.turns.get(msg.params?.threadId);if(t&&assistant.enabled(t.cwd))Promise.resolve(assistant.observe(msg,t)).catch(()=>{});}}catch{}}
    output.write(line+'\n');
  });
  // Forward stderr unchanged; never persist backend diagnostics or credentials in router logs.
  child.stderr.pipe(process.stderr);
  const cleanup=async()=>{
    if(closed)return;closed=true;toBackend.close();fromBackend.close();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CLOSED'));}pending.clear();
    server.close();await assistant?.close();if(guardStore && guardStore !== assistant?.store)guardStore.close();for(const t of router.turns.values())t.active=false;
    try{await unlink(socketPath);}catch{}try{await rmdir(dir);}catch{}
  };
  input.on('end',()=>Promise.allSettled([...threadQueues.values()]).then(()=>child.stdin.end()));child.stdin.on('error',()=>{});
  child.on('error',()=>{log({kind:'backend_start_failed'});cleanup();});
  child.on('exit',()=>cleanup());
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{child.kill(signal);cleanup();});
  log({kind:'bridge_started',nativeEffortOverrideRequested:effortFlags.length>0,policyVersion:POLICY_VERSION,leaseUnit:LEASE_UNIT,runtimeFingerprint:runtimeIdentity,pid:process.pid,backendPid:child.pid,networkMode:env.JEV_NETWORK_MODE??'inherited'});
  return {child,router,request,cleanup,socketPath,flushLog:()=>logPending,flushAutomation:()=>assistant?.flush()};
}

async function main() {
  const home=dirname(fileURLToPath(import.meta.url));
  const config=JSON.parse(await readFile(join(home,'install.json'),'utf8'));
  const args=process.argv.slice(2);
  const passthrough=()=>{
    const env={...process.env};delete env.CODEX_CLI_PATH;
    const child=spawn(config.realBin,args,{stdio:'inherit',env});
    for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));
    child.on('error',()=>{process.stderr.write('Original Codex executable unavailable.\n');process.exitCode=1;});
    child.on('exit',code=>process.exit(code??1));return;
  };
  if(!args.includes('app-server') || args.some(x=>['generate-ts','generate-json-schema','daemon','proxy'].includes(x))) {
    return passthrough();
  }
  await mkdir(join(home,'logs'),{recursive:true,mode:0o700});
  let compatible=false;
  try {
    const version=execFileSync(config.realBin,['--version'],{encoding:'utf8',timeout:4000}).trim();
    compatible=version===config.verifiedVersion && Boolean(config.sha256 && typeof config.sha256==='object' && !Array.isArray(config.sha256) && Object.keys(config.sha256).length);
    for(const [name,hash] of Object.entries(config.sha256??{})) {
      if(createHash('sha256').update(await readFile(join(home,name))).digest('hex')!==hash) compatible=false;
    }
    try{await readFile(join(home,'disabled'));compatible=false;}catch{}
  }catch{}
  if(!compatible){
    await appendFile(join(home,'logs/events.jsonl'),JSON.stringify({at:new Date().toISOString(),kind:'compatibility_fallback'})+'\n',{mode:0o600});
    return passthrough();
  }
  // The desktop regenerates its MCP tables before launching this adapter.
  // Repair that generated configuration before native Codex loads it or starts
  // MCP children. Repairing from the Jev MCP itself would race those children.
  try {
    const { maintainBrowserNetwork } = await import('../../src/browser-network.mjs');
    const network = maintainBrowserNetwork({ home: resolve(home, '../..') });
    await appendFile(join(home,'logs/events.jsonl'),JSON.stringify({at:new Date().toISOString(),kind:'browser_network_before_backend',measurementSource:process.env.JEV_PILOT_MEASUREMENT==='synthetic'?'synthetic':'runtime',...network})+'\n',{mode:0o600});
  } catch {
    // A networking diagnostic must never prevent ordinary Codex startup.
    await appendFile(join(home,'logs/events.jsonl'),JSON.stringify({at:new Date().toISOString(),kind:'browser_network_before_backend',status:'unavailable'})+'\n',{mode:0o600}).catch(()=>{});
  }
  await runBridge({realBin:config.realBin,args,nativeVersion:config.verifiedVersion,trust:config.trust,
    runtimeIdentity:runtimeFingerprint(config.sha256),automation:config.automation===true,keyPath:config.keyPath??join(homedir(),'.codex/skills/jev-assistant/.env.local'),logPath:join(home,'logs/events.jsonl')});
}
if(process.argv[1] && await realpath(resolve(process.argv[1])).catch(()=>null)===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Jev adapter failed to start. Disable the override to use stock Codex.\n');process.exitCode=1;});
