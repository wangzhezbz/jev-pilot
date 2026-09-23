// Opt-in protocol experiment: real models, deterministic routing, no Jev spend.
// This isolates native effort transport, not general workload performance.
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {runBridge,hookOverrides} from '../../runtime/desktop/bridge.mjs';
import {effortQuestion,horizonQuestion} from '../../runtime/desktop/router.mjs';
import {hash} from '../../src/core.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const bin=process.env.JEV_PILOT_CODEX??'/Applications/ChatGPT.app/Contents/Resources/codex';
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/cache-probe');await mkdir(out,{recursive:true});
const models=(process.argv.find(x=>x.startsWith('--models='))?.slice(9)??'gpt-6-sol,gpt-5.6-sol').split(',');
const arms=process.argv.includes('--override-only')?['append']:['top-level','append'];
const prompt='Protocol acceptance exercise. Run exactly three separate sequential shell calls, waiting for each result: (1) node -e "console.log(17*19)" (2) node -e "console.log(23*29)" (3) node -e "console.log(31*37)". Do not combine calls. Then write answer.json containing the array of these three observed numbers. Do not rerun commands or read unrelated files. Final response: the numbers only.';
const protocol={at:new Date().toISOString(),models,arms,prompt,initialEffort:'high',nextEffort:'medium',concurrency:1,jevCalls:0,retries:0,revision:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),nativeVersion:spawnSync(bin,['--version'],{encoding:'utf8'}).stdout.trim(),bridgeHash:hash(await readFile('runtime/desktop/bridge.mjs','utf8')),scope:'Protocol/cache observation with deterministic switch, one task per arm; not stable performance, routing quality or billed savings.'};
await writeFile(join(out,'protocol.json'),JSON.stringify(protocol,null,2),{flag:'wx'});
function client(input,output){let id=0;const pending=new Map(),listeners=[],rl=createInterface({input:output});rl.on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(Error(JSON.stringify(m.error))):p.yes(m.result);}}else if(m.id!==undefined)input.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Unexpected request'}})+'\n');else listeners.forEach(f=>f(m));});return{listeners,request:(method,params)=>new Promise((yes,no)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);no(Error('RPC_TIMEOUT'));},20000);pending.set(n,{yes,no,timer});input.write(JSON.stringify({id:n,method,params})+'\n');}),notify:method=>input.write(JSON.stringify({method})+'\n'),close:()=>{rl.close();for(const p of pending.values()){clearTimeout(p.timer);p.no(Error('CLOSED'));}pending.clear();}};}
async function init(c){await c.request('initialize',{clientInfo:{name:'jev_cache_protocol_probe',version:'1'},capabilities:{experimentalApi:true}});c.notify('initialized');}
const answer=(q,choice)=>({type:'choice',choice,confidence:1,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))});
const rows=[];let interrupted=false;process.once('SIGTERM',()=>{interrupted=true;});process.once('SIGINT',()=>{interrupted=true;});
outer:for(const [index,model] of models.entries())for(const arm of (index%2?[...arms].reverse():arms)){
 if(interrupted)break outer;
 const id=model+'-'+arm,dir=join(out,id);await mkdir(dir);const home=await mkdtemp(join(tmpdir(),'jev-cache-home-')),cwd=await mkdtemp(join(tmpdir(),'jev-cache-task-'));
 await symlink(join(homedir(),'.codex/auth.json'),join(home,'auth.json'));
 const cached=JSON.parse(await readFile(join(homedir(),'.codex/models_cache.json'),'utf8'));await writeFile(join(home,'models.json'),JSON.stringify({models:cached.models}));
 const env={...process.env,CODEX_HOME:home};for(const k of ['CODEX_THREAD_ID','CODEX_SESSION_ID','CODEX_CLI_PATH','TYPESAFE_API_KEY'])delete env[k];
 const args=['app-server','-c',`model_catalog_json=${JSON.stringify(join(home,'models.json'))}`,'-c','features.apps=false','-c','features.multi_agent=false',...(arm==='append'?['--enable','reasoning_effort_override']:['--disable','reasoning_effort_override'])];
 const row={id,model,arm,usage:[],errors:[],commands:[]};let probe,pc,bridge,c,timer;const before=Object.fromEntries(['SIGTERM','SIGINT'].map(k=>[k,new Set(process.listeners(k))]));
 try{
  probe=spawn(bin,[...args,...hookOverrides(process.execPath,resolve('runtime/desktop/hook.mjs'))],{env,stdio:['pipe','pipe','pipe']});probe.stderr.resume();pc=client(probe.stdin,probe.stdout);await init(pc);const hooks=await pc.request('hooks/list',{cwds:[cwd]}),trust={};for(const layer of hooks.data??[])for(const h of layer.hooks??[])if(h.source==='sessionFlags'&&h.command?.includes(resolve('runtime/desktop/hook.mjs')))trust[h.key]=h.currentHash;if(Object.keys(trust).length!==2)throw Error('HOOK_IDENTITY');pc.close();probe.kill();
  let n=0;const input=new PassThrough(),output=new PassThrough();bridge=await runBridge({realBin:bin,args,trust,env,input,output,logPath:join(dir,'routing.jsonl'),judge:async()=>({answer:answer(effortQuestion,n++===0?'high':'medium'),horizon:answer(horizonQuestion,'1'),model:'deterministic-protocol-control',inputTokens:0,outputTokens:0})});bridge.child.stderr.unpipe(process.stderr);bridge.child.stderr.resume();c=client(input,output);await init(c);
  const thread=await c.request('thread/start',{model,cwd,ephemeral:true,sandbox:'workspace-write',approvalPolicy:'never',config:{web_search:'disabled'},developerInstructions:'Follow the specified synthetic protocol exercise. Use only local tools, no plugins, browsing, subagents or unrelated files.'});row.threadId=thread.thread.id;
  let finish;const done=new Promise(r=>finish=r);c.listeners.push(m=>{if(m.params?.threadId!==row.threadId)return;const p=m.params;if(m.method==='thread/tokenUsage/updated'){row.usage.push(p.tokenUsage);void writeFile(join(dir,'usage-latest.json'),JSON.stringify(p.tokenUsage));}if(m.method==='error')row.errors.push(p.error?.message??'native error');if(m.method==='item/completed'&&p.item?.type==='commandExecution')row.commands.push({command:p.item.command,exitCode:p.item.exitCode,output:p.item.aggregatedOutput});if(m.method==='turn/completed'){row.status=p.turn.status;finish();}});
  const start=performance.now();timer=setTimeout(()=>{row.status='timeout';finish();},150000);await c.request('turn/start',{threadId:row.threadId,model,effort:'high',input:[{type:'text',text:prompt}]});await done;clearTimeout(timer);row.wallMs=Math.round(performance.now()-start);row.tokens=row.usage.at(-1)?.total??null;row.answer=await readFile(join(cwd,'answer.json'),'utf8').then(JSON.parse).catch(()=>null);row.passed=row.status==='completed'&&JSON.stringify(row.answer)==='[323,667,1147]';
  if(process.argv.includes('--compact')&&row.passed){
   const compact={startedAt:new Date().toISOString(),events:[]};row.compaction=compact;
   let finishCompact;const compactDone=new Promise(r=>finishCompact=r);
   c.listeners.push(m=>{if(m.params?.threadId!==row.threadId)return;if(['thread/compacted','turn/completed','error'].includes(m.method)){compact.events.push(m);if(m.method==='thread/compacted'||m.method==='turn/completed'||m.method==='error')finishCompact();}});
   await c.request('thread/compact/start',{threadId:row.threadId});
   let compactTimer;await Promise.race([compactDone,new Promise(r=>compactTimer=setTimeout(r,90000))]);clearTimeout(compactTimer);
   compact.passed=compact.events.some(e=>e.method==='thread/compacted'||e.method==='turn/completed'&&e.params.turn.status==='completed')&&!compact.events.some(e=>e.method==='error');
   row.passed=row.passed&&compact.passed;
   if(compact.passed){
    const continuation={messages:[],usage:[]};row.afterCompaction=continuation;let doneAgain;
    const again=new Promise(r=>doneAgain=r);c.listeners.push(m=>{if(m.params?.threadId!==row.threadId)return;const p=m.params;
     if(m.method==='item/completed'&&p.item?.type==='agentMessage')continuation.messages.push(p.item.text);
     if(m.method==='thread/tokenUsage/updated')continuation.usage.push(p.tokenUsage);
     if(m.method==='turn/completed'){continuation.status=p.turn.status;doneAgain();}
    });
    await c.request('turn/start',{threadId:row.threadId,model,effort:'high',input:[{type:'text',text:'Recall the three arithmetic results just obtained, in the same order. No tools. Reply only with the JSON array.'}]});
    let nextTimer;await Promise.race([again,new Promise(r=>nextTimer=setTimeout(r,60000))]);clearTimeout(nextTimer);
    continuation.passed=continuation.status==='completed'&&continuation.messages.some(t=>/\[\s*323\s*,\s*667\s*,\s*1147\s*\]/.test(t));
    row.passed=row.passed&&continuation.passed;
   }
  }
 }catch(e){row.status='infrastructure_error' ;row.error=e.message;row.passed=false;}
 finally{clearTimeout(timer);await bridge?.flushLog();c?.close();pc?.close();probe?.kill();bridge?.child.kill();await bridge?.cleanup();for(const k of ['SIGTERM','SIGINT'])for(const fn of process.listeners(k))if(!before[k].has(fn))process.removeListener(k,fn);row.routing=await readFile(join(dir,'routing.jsonl'),'utf8').then(s=>s.trim().split('\n').filter(Boolean).map(JSON.parse)).catch(()=>[]);}
 row.actualSwitches=row.routing.filter(e=>e.kind==='decision'&&e.status==='applied');row.passed=row.passed&&row.actualSwitches.some(e=>e.from==='high'&&e.published==='medium');if(interrupted){row.interrupted=true;row.passed=false;}rows.push(row);await writeFile(join(out,'results.json'),JSON.stringify({protocol,rows},null,2));console.log(JSON.stringify({id,passed:row.passed,status:row.status,wallMs:row.wallMs,tokens:row.tokens,errors:row.errors,error:row.error}));if(!row.passed){process.exitCode=1;break outer;}
}
