import {requireValue,readSource,hash} from './core.mjs';
import {filterOutput,recall} from './evidence.mjs';
import {outputAdapter} from './output-adapters.mjs';

export const exactEvidenceRequest=goal=>/\b(json|csv|verbatim|exact output)\b|原样|完整输出|不.*删减/i.test(goal);
const codeSource=source=>/\.(?:[cm]?[jt]sx?|py|rs|go|java|c|cpp|h|sh|ps1|sql|toml|ya?ml|json|csv)(?:$|:)/i.test(source);
function structuredText(body){
  try{JSON.parse(body);return true;}catch{}
  const lines=body.trim().split(/\r?\n/).slice(0,20);
  if(lines.length<3)return false;
  // Conservative presentation gate for delimited records. This is not a CSV
  // parser; ambiguous quoted/multiline tables also stay intact.
  return [',','\t',';'].some(separator=>{
    const widths=lines.map(line=>line.split(separator).length);
    return widths.every(width=>width>1)&&new Set(widths).size<=2;
  });
}
// The native runtime allocates these IDs for exec_command calls made inside
// code-mode. Their PostToolUse replacement does not reach the outer result in
// the tested 0.155.0-alpha.9.2 runtime. Never change execution or the raw result.
export const nestedNativeOutput=payload=>payload.tool_name==='Bash'&&/^exec-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(payload.tool_use_id||'');

export function presentationAdapter(value,source=''){
  if(typeof value==='string')return{text:value,wrap:text=>text,kind:'text'};
  if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.output==='string'
    &&value.exit_code===0&&!value.session_id&&Object.keys(value).every(k=>['output','exit_code','wall_time_seconds','chunk_id','original_token_count'].includes(k)))
    return{text:value.output,wrap:output=>({...value,output}),kind:'completed_command'};
  const mcp=outputAdapter(source,value);
  return mcp?{...mcp,wrap:text=>JSON.parse(mcp.wrap(text))}:null;
}

// A presentation-only operation. It never executes/retries a command and never
// mutates the caller's object. On any filtering problem, return the exact value.
export async function prepareOutput(ctx,input){
  requireValue(input&&typeof input.goal==='string'&&input.goal.length>0&&input.goal.length<=10000);
  requireValue((typeof input.path==='string')!==Object.hasOwn(input,'value'),'ONE_OUTPUT_SOURCE_REQUIRED');
  let value=input.value,source=String(input.source||'tool-output');
  if(typeof input.path==='string'){requireValue(input.path.length>0);const file=readSource(ctx.root,input.path);value=file.text;source=file.path;}
  const adapter=presentationAdapter(value,source),body=adapter?.text;
  const emit=(value,selection)=>{ctx.store.event(ctx.project,'prepared_output',{...selection,nativeTokenSavings:null});return{value,selection};};
  const original=reason=>emit(value,{status:'original',reason});
  let reason=!ctx.config.enabled?'disabled':!adapter?'structured_or_unfinished'
    :exactEvidenceRequest(input.goal)||input.exact===true||codeSource(source)?'exact_output'
    :body.length<12000?'small':body.length>100000?'oversized':null;
  if(!reason&&structuredText(body))reason='structured_text';
  if(reason)return original(reason);
  // Keep failure/cancellation budgets bounded and preserve the task guard.
  ctx.judge.config={...ctx.judge.config,maxCalls:Math.min(2,ctx.judge.config.maxCalls),timeoutMs:Math.min(1800,ctx.judge.config.timeoutMs)};
  ctx.judge.concurrency=2;
  let selected;
  try{
    selected=await filterOutput(ctx,{goal:input.goal,text:body,source,budget:500000,requireCompleteJudgment:true});
    if(selected.degraded||ctx.judge.signal?.aborted)return original('degraded');
    if(!selected.completeCoverage||selected.deferredIds.length)return original('incomplete_coverage');
    if(!selected.items.length)return original('empty_selection');
    if(!selected.excludedIds.length&&!selected.duplicateIds.length)return original('no_exclusions');
    const display=`JevPilot partial evidence. Recall omitted material with jev_evidence recall, artifactId ${selected.artifactId}.\n${selected.context}`;
    const prepared=adapter.wrap(display),originalBytes=Buffer.byteLength(JSON.stringify(value)),returnedBytes=Buffer.byteLength(JSON.stringify(prepared));
    // Include result metadata in the benefit check, not just the evidence body.
    const selection={status:'prepared',reason:'reduced',artifactId:selected.artifactId,sourceHash:hash(body),originalBytes,returnedBytes,completeCoverage:true,excludedItems:selected.excludedIds.length,modelReceipt:'unconfirmed',nativeTokenSavings:null};
    if(Buffer.byteLength(JSON.stringify({value:prepared,selection}))>=originalBytes*.8)return original('insufficient_reduction');
    const artifact=ctx.store.get(ctx.project,'artifact',selected.artifactId);
    ctx.store.put(ctx.project,'artifact',{...artifact,originalValue:value},selected.artifactId);
    return emit(prepared,selection);
  }catch{return original('filter_unavailable');}
}

export function recallOutput(ctx,input){
  requireValue(typeof input.artifactId==='string','ARTIFACT_REQUIRED');
  const artifact=ctx.store.get(ctx.project,'artifact',input.artifactId);requireValue(artifact,'ARTIFACT_NOT_FOUND');
  if(!input.ids&&Object.hasOwn(artifact,'originalValue'))return{artifactId:input.artifactId,value:artifact.originalValue,original:true};
  return recall(ctx,input);
}
