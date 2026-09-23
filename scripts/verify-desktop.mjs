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
import {Store,hash} from '../src/core.mjs';
import {installHome} from '../src/setup.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'../runtime/desktop');
const targetModel=process.argv.find(x=>x.startsWith('--model='))?.slice(8)??'gpt-6-astra';
const reassess=process.argv.includes('--reassess');
const parallelTools=process.argv.includes('--parallel-tools');
const recoverTimeout=process.argv.includes('--recover-timeout');
const resumeFixture=process.argv.includes('--resume-context');
const routingBudget=process.argv.includes('--routing-budget');
const phaseReevaluation=process.argv.includes('--phase-reevaluation');
const noBenefitFiltering=process.argv.includes('--no-benefit-filter');
const mcpFiltering=process.argv.includes('--filter-mcp');
const codeModeChainFailure=process.argv.includes('--code-mode-chain-failure');
const codeModeChain=process.argv.includes('--code-mode-chain')||codeModeChainFailure;
const codeModeOutput=process.argv.includes('--code-mode-output')||codeModeChain;
const filtering=process.argv.includes('--filter-output')||mcpFiltering||noBenefitFiltering||process.argv.includes('--steer-context')||codeModeOutput;
const steerContext=process.argv.includes('--steer-context');
const manualSettings=process.argv.includes('--manual-settings');
const inspectCacheContext=process.argv.includes('--inspect-cache-context');
const inputSnapshots=[];
const steps=routingBudget?7:phaseReevaluation?3:steerContext?2:reassess?4:noBenefitFiltering?2:1;
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
  if(steerContext && apiCount===1) {
    const t=[...bridge.router.turns.values()].find(t=>t.active);
    try {report.steer=await c.request('turn/steer',{threadId:t.threadId,expectedTurnId:t.turnId,input:[{type:'text',text:'Continue the evidence search, focusing on NEEDLE target and omit unrelated noise.'}]});}
    catch(error){report.steer={error:error.message};}
  }
  if(manualSettings && apiCount===1) {
    try {
      const t=[...bridge.router.turns.values()].find(t=>t.active);
      report.manualSettings=await c.request('turn/settings/update',{threadId:t.threadId,turnId:t.turnId,effort:'medium'});
    }catch(error){report.manualSettings={error:error.message};}
  }
  const tools=body.tools??body.configuration?.tools??[];
  const tool=(mcpFiltering?(tools.find(x=>x.name?.includes('fixture_log'))??{name:'fixture_log'}):null)??tools.find(x=>['exec_command','shell_command','shell'].includes(x.name))??{name:'exec_command'};
  const responseId='resp_'+apiCount;
  let item;
  if(apiCount<=steps && tool) {
    const command=noBenefitFiltering?`printf 'error '; printf 'important xxxxxxxxxxxxxxxx%.0s' {1..1000}; printf '\n'; printf 'ordinary noise xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n%.0s' {1..100}`:recoverTimeout?'sleep 15.1; printf fixture_ok':filtering?`printf 'NEEDLE target\\n'; printf 'noise xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n%.0s' {1..350}`:(reassess&&apiCount===4)||(routingBudget&&apiCount>=5)?'exit 7':'printf fixture_ok';
    const args=mcpFiltering?{}:tool.name==='exec_command'?{cmd:command,max_output_tokens:filtering?15000:50,...(recoverTimeout?{yield_time_ms:20000}:{})}:
      tool.name==='shell_command'?{command}:{command:['/bin/sh','-c',command]};
    item={id:'fc_fixture_'+apiCount,type:'function_call',call_id:'call_fixture_'+apiCount,name:tool.name,...(mcpFiltering?{namespace:'mcp__fixture'}:{}),arguments:JSON.stringify(args),status:'completed'};
    if(codeModeOutput){
      const rawCheck="if(result.exit_code!==0||(result.output.match(/noise x{64}/g)||[]).length!==350)throw Error('RAW_RESULT_CHANGED');";
      const emit=codeModeChain?'let display=result;try{const entry=ALL_TOOLS.find(t=>/__jev_evidence$/.test(t.name));const reply=await tools[entry.name]({workspace:'+JSON.stringify(work)+',operation:"prepare",input:{goal:"Find NEEDLE target evidence",value:result,source:"exec_command"}});if(!reply.isError){const prepared=reply.structuredContent??JSON.parse(reply.content[0].text);if(Object.hasOwn(prepared,"value"))display=prepared.value;}}catch{}text(display);':'text(result.output);';
      item={id:'ct_fixture_'+apiCount,type:'custom_tool_call',call_id:'call_fixture_'+apiCount,namespace:'functions',name:'exec',input:'const result=await tools.exec_command('+JSON.stringify(args)+');'+rawCheck+emit,status:'completed'};
    }
  }else item={id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'fixture_ok'}]};
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
  const event=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
  event('response.created',{response:{id:responseId,object:'response',status:'in_progress',output:[]}});
  const outputs=parallelTools&&apiCount===1?Array.from({length:5},(_,i)=>({...item,id:'fc_parallel_'+i,call_id:'call_parallel_'+i,arguments:JSON.stringify({cmd:'sleep '+(i*.04)+'; printf fixture_ok',max_output_tokens:50})})):[item];
  for(const [index,entry]of outputs.entries()){event('response.output_item.added',{output_index:index,item:{...entry,status:'in_progress'}});event('response.output_item.done',{output_index:index,item:entry});}
  event('response.completed',{response:{id:responseId,object:'response',status:'completed',output:outputs,
    usage:{input_tokens:50,output_tokens:5,total_tokens:55,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}}}});
  res.end();
});
await new Promise(yes=>server.listen(0,'127.0.0.1',yes));
const address=`http://127.0.0.1:${server.address().port}/v1`;
const args=['app-server','-c',`model=${JSON.stringify(targetModel)}`,'-c','model_provider="jev_fixture"',
  '-c',`model_providers.jev_fixture=${toml({name:'Local synthetic fixture',base_url:address,wire_api:'responses',requires_openai_auth:false,supports_websockets:false,request_max_retries:0,stream_max_retries:0})}`,
  '-c',`features.code_mode=${codeModeOutput}`,'-c',`features.code_mode_host=${codeModeOutput}`];
if(codeModeChain)args.push('-c',`mcp_servers.fixture=${toml({command:process.execPath,args:[join(root,'../../scripts/acceptance/code-mode-evidence-fixture.mjs'),work,...(codeModeChainFailure?['--fail']:[])]})}`);
if(mcpFiltering){
 const script=join(work,'mcp-fixture.mjs');
 await writeFile(script,`import{createInterface}from'node:readline';const lines=createInterface({input:process.stdin});lines.on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result=m.method==='initialize'?{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:m.method==='tools/list'?{tools:[{name:'fixture_log',description:'Read the synthetic test log',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},inputSchema:{type:'object',properties:{}}}]}:m.method==='tools/call'?{content:[{type:'text',text:'NEEDLE target\\n'+('noise xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n').repeat(350)}],isError:false}:m.method==='resources/list'?{resources:[]}:m.method==='resources/templates/list'?{resourceTemplates:[]}:{};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`);
 args.push('-c',`mcp_servers.fixture=${toml({command:process.execPath,args:[script]})}`);
}
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
  const mockedJudge=async state=>{if(resumeFixture)report.resumeState={source:state.previousTurn?.source,requiresReview:state.previousTurn?.requiresReview,historicalTaskPresent:state.previousTurn?.task==='Verify the prepared parser patch',currentTask:state.task};const choice=phaseReevaluation?(judgeCalls++<2?'high':'medium'):(reassess||manualSettings)&&judgeCalls++>0?'medium':'low';if(manualSettings && judgeCalls>1)report.manualJudgeEffort=state.currentEffort;return{answer:{type:'choice',choice,confidence:.4,probabilities:Object.fromEntries(Object.keys(effortQuestion.criteria).map(k=>[k,k===choice?.5:.1]))},horizon:{type:'choice',choice:(routingBudget||phaseReevaluation)?'1':'5',confidence:1,probabilities:Object.fromEntries(Object.keys(horizonQuestion.criteria).map(k=>[k,k===((routingBudget||phaseReevaluation)?'1':'5')?1:0]))},model:'offline-fixture',inputTokens:0};};
  let recoveryCalls=0;
  const judge=recoverTimeout?async state=>{if(recoveryCalls++===0)throw new Error('JEV_TIMEOUT');return mockedJudge(state);}:process.argv.includes('--unavailable-jev')?async()=>{throw new Error('TIMEOUT');}:
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
    if(filtering||resumeFixture)autoStore=new Store({home:join(work,'pilot')});
    const automation=(filtering||resumeFixture)?{store:autoStore,key:'fixture',send:async p=>({model:'fixture',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.entries(p.questions).map(([id,q])=>{const item=p.state.items[Number(id.slice(1))];const choice=item.text.includes('NEEDLE')?'keep':'exclude';return[id,{type:'choice',choice,probabilities:{keep:choice==='keep'?1:0,review:0,exclude:choice==='exclude'?1:0}}]}))})}:false;
    bridge=await runBridge({realBin,args,trust,env,input,output,judge,automation,logPath:join(work,'audit.jsonl')});
  }
  c=client(input,output);
  c.listeners.push(m=>{if(['hook/started','hook/completed','turn/started','turn/completed','thread/tokenUsage/updated','item/started','item/completed','error'].includes(m.method))report.events.push(m);});
  await c.request('initialize',{clientInfo:{name:'jev_desktop_protocol_fixture',version:'0.1'},capabilities:{experimentalApi:true}});c.notify('initialized');
  const models=await c.request('model/list',{includeHidden:true,limit:100});
  report.supportedEfforts=models.data?.find(m=>m.model===targetModel)?.supportedReasoningEfforts?.map(x=>x.reasoningEffort)??[];
  for(const m of models.data??[])bridge?.router.supported.set(m.model,(m.supportedReasoningEfforts??[]).map(x=>x.reasoningEffort));
  const loaded=await c.request('hooks/list',{cwds:[work]});report.trustedHooks=loaded;
  const started=await c.request('thread/start',{model:targetModel,cwd:work,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',
    developerInstructions:'This is a synthetic protocol fixture. Follow the task; no extra tools or agents.'});
  if(resumeFixture)autoStore.put(autoStore.project(work),'checkpoint',{task:'Verify the prepared parser patch',threadId:started.thread.id,turnId:'previous-fixture-turn',updatedAt:new Date().toISOString(),lastPublishedProgress:'Parser patch prepared; tests remain',pending:['Run parser tests'],sourceHashes:{},coverage:'unavailable',auto:true,requiresReview:true},'auto-'+hash(started.thread.id));
  if(mcpFiltering||codeModeChain){
    for(let i=0;i<30;i++){
      report.mcpStatus=await c.request('mcpServerStatus/list',{threadId:started.thread.id,limit:100});
      if(report.mcpStatus.data?.some(s=>s.name==='fixture'&&Object.keys(s.tools??{}).length))break;
      await new Promise(r=>setTimeout(r,100));
    }
  }
  let finish;const finished=new Promise(yes=>finish=yes);
  c.listeners.push(m=>{if(m.method==='turn/completed')finish(m.params);});
  const turn=await c.request('turn/start',{threadId:started.thread.id,model:targetModel,effort:'high',
    ...(process.argv.includes('--mode')?{collaborationMode:{mode:'default',settings:{model:targetModel,reasoning_effort:'high',developer_instructions:null}}}:{}),
    input:[{type:'text',text:resumeFixture?'继续':filtering?'Find the NEEDLE target evidence in the log; unrelated noise can be omitted.':'Execute the exact shell command printf fixture_ok, then reply only with its output. The command and expected answer are fully specified. No design, diagnosis or extra steps are needed.'}]});
  let timer;await Promise.race([finished,new Promise((_,no)=>{timer=setTimeout(()=>no(new Error('TURN_TIMEOUT')),40_000);})]).finally(()=>clearTimeout(timer));
  report.threadId=started.thread.id;report.turnId=turn.turn.id;
  report.syntheticToolEvidence=bridge?.router.turns.get(started.thread.id)?.recent;
  const auditFile=auditOverride??(installed?join(installHome(),'runtime/desktop/logs/events.jsonl'):join(work,'audit.jsonl'));
  await bridge?.flushAutomation();await bridge?.flushLog();
  if(installed&&!auditOverride)for(let i=0;i<20;i++){
    const lines=(await readFile(auditFile,'utf8')).trim().split('\n');
    if(lines.some(line=>{try{const e=JSON.parse(line);return e.kind==='turn_usage'&&e.turnId===turn.turn.id;}catch{return false;}}))break;
    await new Promise(r=>setTimeout(r,50));
  }
  report.audit=(await readFile(auditFile,'utf8')).trim().split('\n').map(JSON.parse).filter(x=>auditOverride||!installed||x.threadId===started.thread.id);
  report.passed=process.argv.includes('--incompatible') || process.argv.includes('--disabled')
    ? report.requests.length>=2 && report.requests.every(x=>x.effort==='high') && report.audit.some(x=>x.kind==='compatibility_fallback')
    : phaseReevaluation
    ? JSON.stringify(report.requests.map(x=>x.effort))===JSON.stringify(['high','high','medium','medium'])&&report.audit.filter(x=>x.kind==='decision').length===4&&report.audit.some(x=>x.kind==='decision'&&x.status==='applied'&&x.from==='high'&&x.published==='medium')
    : recoverTimeout
    ? report.requests.length===2&&report.requests[0].effort==='high'&&report.requests[1].effort==='low'&&report.audit.some(x=>x.kind==='routing_recovery')&&report.audit.some(x=>x.kind==='decision'&&x.status==='applied')&&recoveryCalls===2
    : process.argv.includes('--unavailable-jev')
    ? report.requests.length>=2 && report.requests.every(x=>x.effort==='high') && report.audit.some(x=>x.kind==='fallback')
    : report.requests.length>=2 && report.requests.every((x,i)=>x.effort===(routingBudget?(i>=4?'high':'low'):((reassess&&i>=4)||(manualSettings&&i>0)?'medium':'low'))&&x.model===targetModel)
      && report.audit.some(x=>x.status==='start_forwarded')
      && (!reassess||report.audit.some(x=>x.status==='applied'&&x.published==='medium'))
      && report.audit.some(x=>x.kind==='turn_usage'&&x.usage?.inputTokens===50*(steps+1));
  if(steerContext)report.passed=report.passed&&Boolean(report.steer?.turnId)&&!report.steer?.error&&report.requests.length===3&&!report.requests[1].inputText.includes('JevPilot retained task evidence')&&report.requests[2].inputText.includes('JevPilot retained task evidence');
  if(resumeFixture)report.passed=report.passed&&report.resumeState?.source==='checkpoint'&&report.resumeState?.requiresReview===true&&report.resumeState?.historicalTaskPresent===true&&report.resumeState?.currentTask==='继续'&&report.audit.some(x=>x.kind==='resume_context');
  if(parallelTools)report.passed=report.passed&&report.requests.length===2&&report.audit.filter(x=>x.kind==='decision').length===1&&report.audit.some(x=>x.kind==='turn_usage'&&x.batchLeaseSkips===4)&&report.events.filter(x=>x.method==='item/completed'&&x.params.item?.type==='commandExecution').length===5;
  if(routingBudget)report.passed=report.passed&&report.requests.length===8&&report.audit.filter(x=>x.kind==='decision').length===6&&report.audit.filter(x=>x.kind==='effort_restore'&&x.status==='applied').length===1&&report.audit.filter(x=>x.status==='budget_held').length===2;
  if(manualSettings)report.passed=report.passed&&report.manualSettings?.status==='applied'&&report.manualJudgeEffort==='medium'&&report.audit.some(x=>x.kind==='external_settings'&&x.status==='applied');
  if(inspectCacheContext){
    const initial=inputSnapshots[0];
    report.cacheContext={measurement:'serialized_initial_input_prefix_not_cache_hit_rate',
      initialItems:Array.isArray(initial)?initial.length:null,
      perRequest:inputSnapshots.map((items,i)=>({request:i+1,initialPrefixPreserved:Array.isArray(initial)&&Array.isArray(items)&&JSON.stringify(items.slice(0,initial.length))===JSON.stringify(initial)}))};
    report.passed=report.passed&&report.cacheContext.perRequest.every(x=>x.initialPrefixPreserved);
  }
  if(mcpFiltering){const outputs=JSON.parse(report.requests[1]?.inputText||'[]').filter(x=>x.type==='function_call_output');report.mcpEnvelopePreserved=outputs.some(x=>{try{const r=JSON.parse(x.output);return r.content?.length===1&&r.content[0].type==='text'&&r.content[0].text.includes('NEEDLE target')&&r.isError!==true;}catch{return false;}});report.passed=report.passed&&report.mcpEnvelopePreserved;}
  if(filtering){const saved=autoStore.list(autoStore.project(work),'checkpoint')[0];report.automaticCheckpoint={observed:Boolean(saved),auto:saved?.auto,requiresReview:saved?.requiresReview,turnStatus:saved?.turnStatus,coverage:saved?.coverage,verifiedCompletedCount:saved?.completed?.length??0,publicProgressObserved:Boolean(saved?.lastPublishedProgress)};report.passed=report.passed&&saved?.auto===true&&saved?.requiresReview===true&&saved?.turnStatus==='completed';report.automaticEvents=autoStore.events(autoStore.project(work));report.passed=report.passed&&(noBenefitFiltering ? report.automaticEvents.some(e=>e.kind==='automatic_output_result'&&e.reason==='insufficient_reduction')&&report.automaticEvents.some(e=>e.kind==='automatic_output_admission'&&e.reason==='no_benefit_cooldown')&&!report.automaticEvents.some(e=>e.kind==='automatic_output_filter')&&report.requests.length===3 : report.automaticEvents.some(e=>e.kind==='automatic_output_filter')&&report.requests.slice(1).some(r=>r.inputText?.includes('JevPilot retained task evidence')));}
  if(codeModeOutput){
    const outputs=JSON.parse(report.requests[1]?.inputText||'[]').filter(x=>x.type==='custom_tool_call_output');
    report.codeModeBoundary={mode:codeModeChain?(codeModeChainFailure?'chain_failure':'chain'):'nested_hook_passthrough',modelVisibleBytes:Buffer.byteLength(JSON.stringify(outputs)),noiseLines:(JSON.stringify(outputs).match(/noise x{64}/g)||[]).length,containsTarget:JSON.stringify(outputs).includes('NEEDLE target'),hookSubmissions:report.automaticEvents?.filter(e=>e.kind==='automatic_output_filter').length??0,hookJudgments:report.automaticEvents?.filter(e=>e.kind==='jev_call').length??0,modelRequests:report.requests.length,paidJevCalls:0,paidGptCalls:0};
    if(codeModeChain)report.chainEvidence=JSON.parse(await readFile(join(work,'chain-evidence.json'),'utf8'));
    const nativeCompleted=report.events.some(e=>e.method==='turn/completed'&&e.params.turn.status==='completed');
    report.passed=nativeCompleted&&report.requests.length===2&&report.codeModeBoundary.containsTarget&&report.codeModeBoundary.hookJudgments===0&&report.codeModeBoundary.hookSubmissions===0&&(codeModeChain
      ?report.chainEvidence.calls===1&&(codeModeChainFailure
        ?report.codeModeBoundary.noiseLines===350&&report.chainEvidence.fallbackExact&&report.chainEvidence.selection.status==='original'
        :report.codeModeBoundary.noiseLines===29&&report.chainEvidence.recallExact&&report.chainEvidence.selection.status==='prepared')
      :report.codeModeBoundary.noiseLines===350);
    report.testMeaning=codeModeChain?'Real evidence implementation and native runtime with synthetic judgments; not a paid-model performance measurement.':'Nested hook passes original result through without paying for a discarded replacement.';
  }
  report.status=report.passed?'passed':'failed';
  if(!report.passed)process.exitCode=1;
}catch(error){report.status='failed';report.error=String(error.message);process.exitCode=1;}
finally{
  c?.close();pc?.close();probe?.kill();installed?.kill();bridge?.child.kill();await bridge?.cleanup();server.closeAllConnections();server.close();
  const path=join(work,'report.json');await writeFile(path,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,passed:report.passed,error:report.error,requests:report.requests.map(({number,effort})=>({number,effort})),report:path}));
}
