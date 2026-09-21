import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { readFile, mkdir, mkdtemp, chmod, appendFile, unlink, rmdir, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { Router, makeJudge, POLICY_VERSION } from './router.mjs';

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

export async function runBridge({realBin,args,trust={},keyPath,logPath,judge,automation=false,input=process.stdin,output=process.stdout,env=process.env}={}) {
  const home=dirname(fileURLToPath(import.meta.url));
  const dir=await mkdtemp(join(tmpdir(),'jev-bridge-'));await chmod(dir,0o700);
  const socketPath=process.platform==='win32'?`\\\\.\\pipe\\jev-pilot-${randomUUID()}`:join(dir,'hook.sock');
  let assistant=null;
  if(automation)try{const {createAutomation}=await import('../../src/automation.mjs');assistant=createAutomation(typeof automation==='object'?automation:{});}catch{}
  const prefix=`jev:${randomUUID()}:`;
  const pending=new Map(),clientRequests=new Map();let counter=0,closed=false;
  let logPending=Promise.resolve();
  const log=record=>{if(logPath){const line=JSON.stringify({at:new Date().toISOString(),measurementSource:env.JEV_PILOT_MEASUREMENT==='synthetic'?'synthetic':'runtime',...record})+'\n';
    logPending=logPending.then(()=>appendFile(logPath,line,{mode:0o600})).catch(()=>{});}};
  const childEnv={...env,JEV_BRIDGE_SOCKET:socketPath};
  try {for(const key of JSON.parse(env.JEV_PROXY_ADDED??'[]'))if(['HTTP_PROXY','HTTPS_PROXY','NO_PROXY'].includes(key))delete childEnv[key];}catch{}
  delete childEnv.JEV_PROXY_ADDED;delete childEnv.JEV_NETWORK_MODE;
  delete childEnv.TYPESAFE_API_KEY;
  // Do not let shell tools recursively start this adapter through the override.
  delete childEnv.CODEX_CLI_PATH;
  const child=spawn(realBin,[...args,'--enable','step_model_switching',...hookOverrides(process.execPath,join(home,'hook.mjs'),trust)],
    {env:childEnv,stdio:['pipe','pipe','pipe']});
  const send=x=>{if(!closed) child.stdin.write(JSON.stringify(x)+'\n');};
  const request=(method,params,timeout=10_000)=>new Promise((resolve,reject)=>{
    if(closed) return reject(new Error('CLOSED'));
    const id=prefix+(++counter),timer=setTimeout(()=>{pending.delete(id);reject(new Error('TIMEOUT'));},timeout);
    pending.set(id,{resolve,reject,timer});send({id,method,params});
  });
  const router=new Router({request,judge:judge??await makeJudge(keyPath),log});
  let metadataReady=Promise.resolve();
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
    const starting=msg.method==='turn/start'?router.start(threadId,msg.params):null;
    if(msg.method==='turn/steer') router.invalidate(msg.params.threadId,msg.params.input);
    if(msg.method==='turn/interrupt') router.stop(msg.params.threadId);
    // Keep control messages behind their pending start, while invalidating
    // recommendations immediately. Other threads and backend RPC replies flow.
    if(starting || (threadId && threadQueues.has(threadId))) {
      const job=(threadQueues.get(threadId)??Promise.resolve()).then(async()=>{
        if(starting){await metadataReady;const cwd=msg.params.cwd??router.threads.get(threadId)?.cwd;if(!assistant||!cwd||assistant.enabled(cwd))msg.params=await router.routeStart(msg.params,starting);else router.stop(threadId);}
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
      const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error('RPC_FAILED')):p.resolve(msg.result);}return;
    }
    if(!msg.method && msg.id!==undefined){
      const p=clientRequests.get(JSON.stringify(msg.id));clientRequests.delete(JSON.stringify(msg.id));
      if(p?.method==='initialize' && !msg.error) {
        metadataReady=request('model/list',{includeHidden:true,limit:100}).then(result=>{
          for(const m of result.data??[]) router.supported.set(m.model,(m.supportedReasoningEfforts??[]).map(x=>x.reasoningEffort));
        }).catch(()=>log({kind:'metadata_unavailable'}));
      }
      if(['thread/start','thread/resume'].includes(p?.method) && msg.result?.thread) {
        const r=msg.result;router.threads.set(r.thread.id,{model:r.model,effort:r.reasoningEffort,cwd:r.thread.cwd??p.params?.cwd});
      }
      if(p?.method==='turn/start' && msg.error){
        router.stop(p.params.threadId);log({kind:'start_rejected',threadId:p.params.threadId});
      }
    }
    if(msg.method)router.observe(msg);
    output.write(line+'\n');
  });
  // Forward stderr unchanged; never persist backend diagnostics or credentials in router logs.
  child.stderr.pipe(process.stderr);
  const cleanup=async()=>{
    if(closed)return;closed=true;toBackend.close();fromBackend.close();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CLOSED'));}pending.clear();
    server.close();assistant?.close();for(const t of router.turns.values())t.active=false;
    try{await unlink(socketPath);}catch{}try{await rmdir(dir);}catch{}
  };
  input.on('end',()=>Promise.allSettled([...threadQueues.values()]).then(()=>child.stdin.end()));child.stdin.on('error',()=>{});
  child.on('error',()=>{log({kind:'backend_start_failed'});cleanup();});
  child.on('exit',()=>cleanup());
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{child.kill(signal);cleanup();});
  log({kind:'bridge_started',policyVersion:POLICY_VERSION,pid:process.pid,backendPid:child.pid,networkMode:env.JEV_NETWORK_MODE??'inherited'});
  return {child,router,request,cleanup,socketPath,flushLog:()=>logPending};
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
    compatible=version===config.verifiedVersion;
    for(const [name,hash] of Object.entries(config.sha256??{})) {
      if(createHash('sha256').update(await readFile(join(home,name))).digest('hex')!==hash) compatible=false;
    }
    try{await readFile(join(home,'disabled'));compatible=false;}catch{}
  }catch{}
  if(!compatible){
    await appendFile(join(home,'logs/events.jsonl'),JSON.stringify({at:new Date().toISOString(),kind:'compatibility_fallback'})+'\n',{mode:0o600});
    return passthrough();
  }
  await runBridge({realBin:config.realBin,args,trust:config.trust,
    automation:config.automation===true,keyPath:config.keyPath??join(homedir(),'.codex/skills/jev-assistant/.env.local'),logPath:join(home,'logs/events.jsonl')});
}
if(process.argv[1] && await realpath(resolve(process.argv[1])).catch(()=>null)===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Jev adapter failed to start. Disable the override to use stock Codex.\n');process.exitCode=1;});
