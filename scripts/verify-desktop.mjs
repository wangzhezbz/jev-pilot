// Real bundled Codex runtime; synthetic HTTP model backend, no OpenAI model spend.
import {createServer} from 'node:http';
import {PassThrough} from 'node:stream';
import {mkdtemp,writeFile,readFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runBridge,hookOverrides,toml} from '../runtime/desktop/bridge.mjs';
import {effortQuestion,horizonQuestion,makeJudge} from '../runtime/desktop/router.mjs';
import {Store} from '../src/core.mjs';
import {installHome} from '../src/setup.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'../runtime/desktop');
const targetModel=process.argv.find(x=>x.startsWith('--model='))?.slice(8)??'gpt-6-astra';
const reassess=process.argv.includes('--reassess');
const routingBudget=process.argv.includes('--routing-budget');
const filtering=process.argv.includes('--filter-output');
const manualSettings=process.argv.includes('--manual-settings');
const inspectCacheContext=process.argv.includes('--inspect-cache-context');
const inputSnapshots=[];
const steps=routingBudget?7:reassess?4:1;
const realBin=process.env.JEV_PILOT_CODEX??'/Applications/ChatGPT.app/Contents/Resources/codex';
const work=await mkdtemp(join(tmpdir(),'jev-desktop-verification-'));
const codexHome=join(work,'home');await mkdir(codexHome);
const report={kind:'bundled_runtime_with_synthetic_model',work,openaiPaidCalls:0,requests:[],events:[],status:'running'};
const env={...process.env,CODEX_HOME:codexHome,JEV_PILOT_MEASUREMENT:'synthetic'};
if(process.argv.includes('--gui-network'))for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NO_PROXY','no_proxy'])delete env[key];
delete env.TYPESAFE_API_KEY;delete env.CODEX_THREAD_ID;delete env.CODEX_SESSION_ID;
let apiCount=0;
const server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  if(!req.url.endsWith('/responses')){res.writeHead(404);res.end();return;}
  const body=JSON.parse(raw);apiCount++;
  if(inspectCacheContext)inputSnapshots.push(body.input);
  report.requests.push({number:apiCount,model:body.model,effort:body.reasoning?.effort,keys:Object.keys(body),toolNames:body.tools?.map(t=>t.name??t.type),configuration:body.configuration,inputText:filtering?JSON.stringify(body.input):undefined});
  if(manualSettings && apiCount===1) {
    try {
      const t=[...bridge.router.turns.values()].find(t=>t.active);
      report.manualSettings=await c.request('turn/settings/update',{threadId:t.threadId,turnId:t.turnId,effort:'medium'});
    }catch(error){report.manualSettings={error:error.message};}
  }
  const tools=body.tools??body.configuration?.tools??[];
  const tool=tools.find(x=>['exec_command','shell_command','shell'].includes(x.name))??{name:'exec_command'};
  const responseId='resp_'+apiCount;
  let item;
  if(apiCount<=steps && tool) {
    const command=filtering?`printf 'NEEDLE target\\n'; printf 'noise xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n%.0s' {1..350}`:(reassess&&apiCount===4)||(routingBudget&&apiCount>=5)?'exit 7':'printf fixture_ok';
    const args=tool.name==='exec_command'?{cmd:command,max_output_tokens:filtering?15000:50}:
      tool.name==='shell_command'?{command}:{command:['/bin/sh','-c',command]};
    item={id:'fc_fixture_'+apiCount,type:'function_call',call_id:'call_fixture_'+apiCount,name:tool.name,arguments:JSON.stringify(args),status:'completed'};
  }else item={id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'fixture_ok'}]};
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
  const event=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  event('response.created',{response:{id:responseId,object:'response',status:'in_progress',output:[]}});
  event('response.output_item.added',{output_index:0,item:{...item,status:'in_progress'}});
  event('response.output_item.done',{output_index:0,item});
  event('response.completed',{response:{id:responseId,object:'response',status:'completed',output:[item],
    usage:{input_tokens:50,output_tokens:5,total_tokens:55,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}});
  res.end();
});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
const address=`http://127.0.0.1:${server.address().port}/v1`;
const args=['app-server','-c',`model=${JSON.stringify(targetModel)}`,'-c','model_provider="jev_fixture"',
  '-c',`model_providers.jev_fixture=${toml({name:'Local synthetic fixture',base_url:address,wire_api:'responses',requires_openai_auth:false,supports_websockets:false,request_max_retries:0,stream_max_retries:0})}`,
  '-c','features.code_mode=false','-c','features.code_mode_host=false'];
if(process.argv.includes('--use-local-catalog')) {
  // New models can arrive in the desktop catalog before the binary's bundled
  // fallback list. Copy public model metadata only, never credentials/identity.
  const cached=JSON.parse(await readFile(join(process.env.CODEX_HOME||join(homedir(),'.codex'),'models_cache.json'),'utf8'));
  if(!Array.isArray(cached.models)||!cached.models.some(m=>m.slug===targetModel))throw new Error('MODEL_NOT_IN_LOCAL_CATALOG');
  const catalog=JSON.stringify({models:cached.models}),path=join(work,'models.json');
  await writeFile(path,catalog,{mode:0o600});args.push('-c',`model_catalog_json=${JSON.stringify(path)}`);
  report.catalog={source:'local_desktop_models_cache',sha256:createHash('sha256').update(catalog).digest('hex')};
}

function client(input,output){
  let id=0;const pending=new Map();const listeners=[];
  const lines=createInterface({input:output});lines.on('line',line=>{
    let m;try{m=JSON.parse(line);}catch{return;}
    if(m.id!==undefined && !m.method){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(new Error(JSON.stringify(m.error))):p.yes(m.result);}}
    else for(const fn of listeners)fn(m);
  });
  return {request:(method,params)=>new Promise((yes,no)=>{
    const n=++id,timer=setTimeout(()=>{pending.delete(n);no(new Error('TIMEOUT '+method));},20_000);pending.set(n,{yes,no,timer});input.write(JSON.stringify({id:n,method,params})+'\n');
  }),listeners,notify:(method)=>input.write(JSON.stringify({method})+'\n'),close:()=>{lines.close();for(const p of pending.values()){clearTimeout(p.timer);p.no(new Error('CLOSED'));}pending.clear();}};
}
let bridge,c,probe,pc,installed,auditOverride,autoStore;
try{
  // Exact hook hashes are obtained before any inference; only our reviewed commands are trusted.
  probe=spawn(realBin,[...args,...hookOverrides(process.execPath,join(root,'hook.mjs'))],{env,stdio:['pipe','pipe','pipe']});probe.stderr.resume();
  pc=client(probe.stdin,probe.stdout);
  await pc.request('initialize',{clientInfo:{name:'jev_hook_probe',version:'0.1'},capabilities:{experimentalApi:true}});pc.notify('initialized');
  const hooks=await pc.request('hooks/list',{cwds:[work]});
  report.hookDiscovery=hooks;
  const trust={};
  const collect=x=>{if(!x||typeof x!=='object')return;if(x.key&&x.currentHash&&x.source==='sessionFlags'&&x.handler?.command?.includes(join(root,'hook.mjs')))trust[x.key]=x.currentHash;for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(collect):collect(v);};
  collect(hooks);
  if(!Object.keys(trust).length){
    // Metadata differs across runtime versions; never trust an unrelated hook.
    const collect2=x=>{if(!x||typeof x!=='object')return;if(x.key&&x.currentHash&&JSON.stringify(x).includes(join(root,'hook.mjs')))trust[x.key]=x.currentHash;for(const v of Object.values(x))if(typeof v==='object')Array.isArray(v)?v.forEach(collect2):collect2(v);};collect2(hooks);
  }
  if(Object.keys(trust).length!==2)throw new Error('Expected exactly two reviewed hooks');
  pc.close();probe.kill();
  await writeFile(join(work,'trust.json'),JSON.stringify(trust,null,2));
  let input=new PassThrough(),output=new PassThrough();
  let judgeCalls=0;
  const mockedJudge=async state=>{const choice=(reassess||manualSettings)&&judgeCalls++>0?'medium':'low';if(manualSettings && judgeCalls>1)report.manualJudgeEffort=state.currentEffort;return{answer:{type:'choice',choice,confidence:.4,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k===choice?.5:.1]))},horizon:{type:'choice',choice:routingBudget?'1':'5',confidence:1,probabilities:Object.fromEntries(Object.keys(horizonQuestion.criteria).map(k=>[k,k===(routingBudget?'1':'5')?1:0]))},model:'offline-fixture',inputTokens:0};};
  const judge=process.argv.includes('--unavailable-jev')?async()=>{throw new Error('TIMEOUT');}:
    process.argv.includes('--real-jev')?await makeJudge(join(installHome(),'.env.local')):mockedJudge;
  report.realJev=process.argv.includes('--real-jev');
  if(process.argv.includes('--incompatible') || process.argv.includes('--disabled')) {
    const isolated=join(work,'adapter/runtime/desktop');await mkdir(isolated,{recursive:true});await cp(join(root,'../../src'),join(work,'adapter/src'),{recursive:true});
    for(const file of ['bridge.mjs','router.mjs','hook.mjs','transport.mjs','bootstrap.mjs'])await copyFile(join(root,file),join(isolated,file));
    const disabled=process.argv.includes('--disabled');
    const sha256={'bridge.mjs':createHash('sha256').update(await readFile(join(isolated,'bridge.mjs'))).digest('hex')};
    await writeFile(join(isolated,'install.json'),JSON.stringify({realBin,verifiedVersion:disabled?execFileSync(realBin,['--version'],{encoding:'utf8'}).trim():'deliberately-incompatible',sha256,trust:{}}));
    if(disabled)await writeFile(join(isolated,'disabled'),'disabled\n');
    installed=spawn(process.execPath,[join(isolated,'bridge.mjs'),...args],{env,stdio:['pipe','pipe','pipe']});installed.stderr.pipe(process.stderr);
    input=installed.stdin;output=installed.stdout;auditOverride=join(isolated,'logs/events.jsonl');
  } else if(process.argv.includes('--installed')) {
    installed=spawn(join(installHome(),process.platform==='win32'?'jev-pilot.exe':'jev-pilot'),args,{env,stdio:['pipe','pipe','pipe']});installed.stderr.pipe(process.stderr);
    input=installed.stdin;output=installed.stdout;report.realJev=true;
  } else {
    if(filtering)autoStore=new Store({home:join(work,'pilot')});
    const automation=filtering?{store:autoStore,key:'fixture',send:async p=>({model:'fixture',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>{const item=p.state.items[Number(id.slice(1))];const choice=item.text.includes('NEEDLE')?'keep':'exclude';return[id,{type:'choice',choice,probabilities:{keep:choice==='keep'?1:0,review:0,exclude:choice==='exclude'?1:0}}]}))})}:false;
    bridge=await runBridge({realBin,args,trust,env,input,output,judge,automation,logPath:join(work,'audit.jsonl')});
  }
  c=client(input,output);
  c.listeners.push(m=>{if(['hook/started','hook/completed','turn/started','turn/completed','item/completed','error'].includes(m.method))report.events.push(m);});
  await c.request('initialize',{clientInfo:{name:'jev_desktop_protocol_fixture',version:'0.1'},capabilities:{experimentalApi:true}});c.notify('initialized');
  const models=await c.request('model/list',{includeHidden:true,limit:100});
  report.supportedEfforts=models.data?.find(m=>m.model===targetModel)?.supportedReasoningEfforts?.map(x=>x.reasoningEffort)??[];
  for(const m of models.data??[])bridge?.router.supported.set(m.model,(m.supportedReasoningEfforts??[]).map(x=>x.reasoningEffort));
  const loaded=await c.request('hooks/list',{cwds:[work]});report.trustedHooks=loaded;
  const started=await c.request('thread/start',{model:targetModel,cwd:work,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',
    developerInstructions:'This is a synthetic protocol fixture. Follow the task; no extra tools or agents.'});
  let finish;const finished=new Promise(yes=>finish=yes);
  c.listeners.push(m=>{if(m.method==='turn/completed')finish(m.params);});
  const turn=await c.request('turn/start',{threadId:started.thread.id,model:targetModel,effort:'high',
    ...(process.argv.includes('--mode')?{collaborationMode:{mode:'default',settings:{model:targetModel,reasoning_effort:'high',developer_instructions:null}}}:{}),
    input:[{type:'text',text:filtering?'Find the NEEDLE target evidence in the log; unrelated noise can be omitted.':'Execute the exact shell command printf fixture_ok, then reply only with its output. The command and expected answer are fully specified. No design, diagnosis or extra steps are needed.'}]});
  let timer;await Promise.race([finished,new Promise((_,no)=>{timer=setTimeout(()=>no(new Error('TURN_TIMEOUT')),40_000);})]).finally(()=>clearTimeout(timer));
  report.threadId=started.thread.id;report.turnId=turn.turn.id;
  report.syntheticToolEvidence=bridge?.router.turns.get(started.thread.id)?.recent;
  const auditFile=auditOverride??(installed?join(installHome(),'runtime/desktop/logs/events.jsonl'):join(work,'audit.jsonl'));
  await bridge?.flushLog();
  if(installed&&!auditOverride)for(let i=0;i<20;i++){
    const lines=(await readFile(auditFile,'utf8')).trim().split('\n');
    if(lines.some(line=>{try{const e=JSON.parse(line);return e.kind==='turn_usage'&&e.turnId===turn.turn.id;}catch{return false;}}))break;
    await new Promise(r=>setTimeout(r,50));
  }
  report.audit=(await readFile(auditFile,'utf8')).trim().split('\n').map(JSON.parse).filter(x=>auditOverride||!installed||x.threadId===started.thread.id);
  report.passed=process.argv.includes('--incompatible') || process.argv.includes('--disabled')
    ? report.requests.length>=2 && report.requests.every(x=>x.effort==='high') && report.audit.some(x=>x.kind==='compatibility_fallback')
    : process.argv.includes('--unavailable-jev')
    ? report.requests.length>=2 && report.requests.every(x=>x.effort==='high') && report.audit.some(x=>x.kind==='fallback')
    : report.requests.length>=2 && report.requests.every((x,i)=>x.effort===(routingBudget?(i>=4?'high':'low'):((reassess&&i>=4)||(manualSettings&&i>0)?'medium':'low'))&&x.model===targetModel)
      && report.audit.some(x=>x.status==='start_forwarded')
      && (!reassess||report.audit.some(x=>x.status==='applied'&&x.published==='medium'))
      && report.audit.some(x=>x.kind==='turn_usage'&&x.usage?.inputTokens===50*(steps+1));
  if(routingBudget)report.passed=report.passed&&report.requests.length===8&&report.audit.filter(x=>x.kind==='decision').length===6&&report.audit.filter(x=>x.kind==='effort_restore'&&x.status==='applied').length===1&&report.audit.filter(x=>x.status==='budget_held').length===2;
  if(manualSettings)report.passed=report.passed&&report.manualSettings?.status==='applied'&&report.manualJudgeEffort==='medium'&&report.audit.some(x=>x.kind==='external_settings'&&x.status==='applied');
  if(inspectCacheContext){
    const initial=inputSnapshots[0];
    report.cacheContext={measurement:'serialized_initial_input_prefix_not_cache_hit_rate',
      initialItems:Array.isArray(initial)?initial.length:null,
      perRequest:inputSnapshots.map((items,i)=>({request:i+1,initialPrefixPreserved:Array.isArray(initial)&&Array.isArray(items)&&JSON.stringify(items.slice(0,initial.length))===JSON.stringify(initial)}))};
    report.passed=report.passed&&report.cacheContext.perRequest.every(x=>x.initialPrefixPreserved);
  }
  if(filtering){report.automaticEvents=autoStore.events(autoStore.project(work));report.passed=report.passed&&report.automaticEvents.some(e=>e.kind==='automatic_output_filter')&&report.requests.slice(1).some(r=>r.inputText?.includes('JevPilot retained task evidence'));}
  report.status=report.passed?'passed':'failed';
  if(!report.passed)process.exitCode=1;
}catch(error){report.status='failed';report.error=String(error.message);process.exitCode=1;}
finally{
  c?.close();pc?.close();probe?.kill();installed?.kill();bridge?.child.kill();await bridge?.cleanup();server.closeAllConnections();server.close();
  const path=join(work,'report.json');await writeFile(path,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,passed:report.passed,error:report.error,requests:report.requests.map(({number,effort})=>({number,effort})),report:path}));
}
