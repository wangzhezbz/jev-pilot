// Native protocol research only. All model responses and Jev judgments are synthetic.
// No global hooks, installed plugin or user's Codex configuration are modified.
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const exec=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.argv.find(x=>x.startsWith('--out='))?.slice(6);
if(!out)throw Error('OUTPUT_DIRECTORY_REQUIRED');
const destination=resolve(out),work=await mkdtemp(join(tmpdir(),'jev-pretool-study-'));
const original=await readFile(join(root,'scripts/verify-desktop.mjs'),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const replace=(s,from,to)=>{if(!s.includes(from))throw Error('HARNESS_CONTRACT_CHANGED: '+from.slice(0,70));return s.replace(from,to);};
let template=original;
for(const path of ['runtime/desktop/bridge.mjs','runtime/desktop/router.mjs','src/core.mjs','src/setup.mjs'])
  template=replace(template,"'../"+path+"'",JSON.stringify(pathToFileURL(join(root,path)).href));
template=replace(template,"const root=join(dirname(fileURLToPath(import.meta.url)),'../runtime/desktop');",'const root='+JSON.stringify(join(root,'runtime/desktop'))+';');
const results=[];
for(const variant of ['baseline','pretool_display','pretool_raw_consumer','same_cell_projection']){
  let script=join(root,'scripts/verify-desktop.mjs');
  if(variant.startsWith('pretool_')){
    const hook=join(work,variant+'-hook.mjs'),log=join(work,variant+'-hook.jsonl');
    // Deliberately unsafe demonstration, gated to this exact synthetic fixture.
    // head would also change pipe exit semantics: never use this as a production wrapper.
    await writeFile(hook,`import {appendFileSync} from 'node:fs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const p=JSON.parse(raw),i=p.tool_input??{},cmd=i.command??i.cmd;
const matched=typeof cmd==='string'&&cmd.includes('NEEDLE target')&&cmd.includes('{1..350}');
appendFileSync(${JSON.stringify(log)},JSON.stringify({tool:p.tool_name,keys:Object.keys(i),matched})+'\\n');
process.stdout.write(JSON.stringify(matched?{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',updatedInput:{...i,[Object.hasOwn(i,'command')?'command':'cmd']:'{ '+cmd+'; } | head -n 1'}}}:{}));
`);
    let source=replace(template,'if(cachePreservingEffort&&!adapterCacheDefault)',`const fixtureHookPath=${JSON.stringify(hook)};
args.push('-c',\`hooks.PreToolUse=\${toml([{matcher:'.*',hooks:[{type:'command',command:JSON.stringify(process.execPath)+' '+JSON.stringify(fixtureHookPath),timeout:12}]}])}\`);
if(cachePreservingEffort&&!adapterCacheDefault)`);
    source=replace(source,"x.handler?.command?.includes(join(root,'hook.mjs'))","(x.handler?.command?.includes(join(root,'hook.mjs'))||x.handler?.command?.includes(fixtureHookPath))");
    source=replace(source,"JSON.stringify(x).includes(join(root,'hook.mjs'))","(JSON.stringify(x).includes(join(root,'hook.mjs'))||JSON.stringify(x).includes(fixtureHookPath))");
    source=replace(source,'Object.keys(trust).length!==2','Object.keys(trust).length!==3');
    source=replace(source,'Expected exactly two reviewed hooks','Expected exactly three reviewed hooks');
    if(variant==='pretool_display')source=replace(source,`const rawCheck="if(result.exit_code!==0||(result.output.match(/noise x{64}/g)||[]).length!==350)throw Error('RAW_RESULT_CHANGED');";`,'const rawCheck="";');
    source=replace(source,"  report.status=report.passed?'passed':'failed';",`
  const visible=JSON.parse(report.requests[1]?.inputText||'[]').filter(x=>x.type==='custom_tool_call_output');
  const visibleText=JSON.stringify(visible);
  report.preToolStudy={hookEvents:(await readFile(${JSON.stringify(log)},'utf8')).trim().split('\\n').map(JSON.parse),rawConsumerFailed:visibleText.includes('RAW_RESULT_CHANGED')};
  report.passed=report.requests.length===2&&report.preToolStudy.hookEvents.some(x=>x.matched)&&report.codeModeBoundary.noiseLines===0&&(${JSON.stringify(variant)}==='pretool_display'?report.codeModeBoundary.containsTarget:report.preToolStudy.rawConsumerFailed);
  report.status=report.passed?'passed':'failed';`);
    script=join(work,variant+'.mjs');await writeFile(script,source);
  }
  // --real-jev and installed credentials are never passed to the fixture harness.
  const mode=variant==='same_cell_projection'?'--code-mode-chain':'--code-mode-output';
  const env={...process.env,JEV_PILOT_MEASUREMENT:'synthetic'};delete env.TYPESAFE_API_KEY;
  const {stdout}=await exec(process.execPath,[script,mode,'--use-local-catalog'],{cwd:root,env,timeout:60000,maxBuffer:1024*1024});
  const receipt=JSON.parse(stdout.trim().split('\n').at(-1));
  const report=JSON.parse(await readFile(receipt.report,'utf8'));
  const visible=JSON.parse(report.requests[1]?.inputText||'[]').filter(x=>x.type==='custom_tool_call_output');
  const consumerFailed=JSON.stringify(visible).includes('RAW_RESULT_CHANGED');
  results.push({variant,hypothesisConfirmed:report.passed===true,
    rawConsumerCheck:variant==='pretool_display'?'not_performed':consumerFailed?'failed':'passed',
    modelVisibleBytes:report.codeModeBoundary.modelVisibleBytes,noiseLines:report.codeModeBoundary.noiseLines,
    targetVisible:report.codeModeBoundary.containsTarget,modelRequests:report.requests.length,
    recallExact:report.chainEvidence?.recallExact??null,
    preToolMatched:report.preToolStudy?.hookEvents.some(x=>x.matched)??false,
    rawConsumerFailed:consumerFailed,
    nativeTurnCompleted:report.events.some(x=>x.method==='turn/completed'&&x.params.turn.status==='completed'),
    modelOutputSha256:digest(JSON.stringify(visible)),paidGptCalls:0,paidJevCalls:0});
}
const native=process.env.JEV_PILOT_CODEX??'/Applications/ChatGPT.app/Contents/Resources/codex';
const {stdout:version}=await exec(native,['--version']);
const report={at:new Date().toISOString(),nativeVersion:version.trim(),platform:process.platform,architecture:process.arch,
  harnessSha256:digest(original),studySha256:digest(await readFile(fileURLToPath(import.meta.url))),
  scope:'Native transport and raw-result integrity only. All model outputs/judgments are synthetic; native usage fields are fabricated fixture values and excluded. No real task quality, paid token savings, latency gains or automatic adoption measured.',
  pretoolConsumerFailureIsExpected:true,paidGptCalls:0,paidJevCalls:0,results};
await mkdir(destination,{recursive:true});await writeFile(join(destination,'protocol-results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
if(results.some(x=>!x.hypothesisConfirmed))process.exitCode=1;
