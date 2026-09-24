// One read-only retrieval operation. No command rewriting, execution or history mutation.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {statSync} from 'node:fs';
import {array,text,requireValue,inside,readSource,byteBudget,now} from './core.mjs';
import {selectEvidence} from './evidence.mjs';
import {protectedEvidence} from './policy.mjs';
import {projectEvidence} from './evidence-projection.mjs';
const exec=promisify(execFile);
const MAX_FILES=400,MAX_BYTES=4000000,MAX_FILE_BYTES=1000000;
const render=item=>`[${item.id} ${item.source}:${item.startLine}-${item.endLine}]\n${item.text}\n`;

function localEvidence(ctx,goal,items,budget,reason){
  const artifactId=ctx.store.put(ctx.project,'artifact',{goal,items,createdAt:now()});
  const retained=[],deferred=[];let used=0;
  // Never silently discard protected evidence to satisfy a presentation budget.
  const add=item=>{retained.push(item);used+=byteBudget(render(item));};
  const full=reason==='exact_requested'?{displayBytes:items.reduce((n,x)=>n+byteBudget(render(x)),0)}:projectEvidence(items);
  if(full.displayBytes<=budget){retained.push(...items);used=full.displayBytes;}
  else{
    for(const item of items.filter(protectedEvidence))add(item);
    for(const item of items.filter(x=>!protectedEvidence(x))){
      if(used+byteBudget(render(item))<=budget)add(item);else deferred.push(item.id);
    }
  }
  retained.sort((a,b)=>items.indexOf(a)-items.indexOf(b));
  return {artifactId,context:retained.map(render).join(''),items:retained,excludedIds:[],duplicateIds:[],deferredIds:deferred,
    coverage:{total:items.length,retained:retained.length,excluded:0,duplicates:0,deferred:deferred.length},
    completeCoverage:deferred.length===0,degraded:false,budget,usedBytes:used,protectedOverflow:used>budget,
    recovery:{operation:'recall',artifactId},selection:{method:'local',reason}};
}

export async function investigate(ctx,{goal,queries,paths=['.'],contextLines=8,maxMatches=200,budget=16000,selection='auto',exact=false}){
  text(goal,10000);requireValue(goal.trim().length>0);
  array(queries,6);requireValue(queries.length>0);queries.forEach(q=>{text(q,200);requireValue(q.trim().length>0&&!/[\r\n\0]/.test(q));});
  array(paths,20);requireValue(paths.length>0);
  for(const path of paths){text(path,1000);requireValue(path.length>0&&!path.startsWith('-'));inside(ctx.root,path);}
  requireValue(Number.isInteger(contextLines)&&contextLines>=0&&contextLines<=40);
  requireValue(Number.isInteger(maxMatches)&&maxMatches>=1&&maxMatches<=400);
  requireValue(Number.isInteger(budget)&&budget>=128&&budget<=100000);
  requireValue(['auto','local'].includes(selection));
  requireValue(typeof exact==='boolean');
  const checkCancelled=()=>requireValue(!ctx.judge.signal?.aborted,'CANCELLED');checkCancelled();
  let stdout;
  try{({stdout}=await exec('rg',['--no-config','--files','--null','--',...paths],{cwd:ctx.root,signal:ctx.judge.signal,timeout:5000,maxBuffer:512000,windowsHide:true}));}
  catch(e){if(e.code===1)stdout='';else throw Object.assign(new Error('RETRIEVAL_UNAVAILABLE'),{code:'RETRIEVAL_UNAVAILABLE'});}
  const files=[...new Set(stdout.split('\0').filter(Boolean))].sort();
  const needles=[...new Set(queries.map(q=>q.toLocaleLowerCase('en-US')))];
  const items=[],sources=[],skipped=[];let bytes=0,scanned=0,matches=0,limited=files.length>MAX_FILES;
  for(const path of files.slice(0,MAX_FILES)){
    checkCancelled();let source;
    try{
      const file=inside(ctx.root,path),size=statSync(file).size;
      if(size>MAX_FILE_BYTES||bytes+size>MAX_BYTES){limited=true;skipped.push({path,reason:'size_limit'});continue;}
      source=readSource(ctx.root,path,MAX_FILE_BYTES);bytes+=Buffer.byteLength(source.text);scanned++;
    }catch(e){skipped.push({path,reason:typeof e.code==='string'?e.code:'unreadable_or_nontext'});continue;}
    const lines=source.text.split('\n'),ranges=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i].toLocaleLowerCase('en-US');if(!needles.some(q=>line.includes(q)))continue;
      if(matches===maxMatches){limited=true;break;}
      matches++;
      const start=Math.max(0,i-contextLines),end=Math.min(lines.length,i+contextLines+1),last=ranges.at(-1);
      if(last&&start<=last.end)last.end=Math.max(last.end,end);else ranges.push({start,end});
    }
    if(ranges.length){
      sources.push({path:source.path,hash:source.hash});
      for(const range of ranges)items.push({id:'i'+items.length,source:source.path,sourceHash:source.hash,startLine:range.start+1,endLine:range.end,text:lines.slice(range.start,range.end).join('\n')});
    }
    if(matches===maxMatches){if(path!==files.at(-1))limited=true;break;}
  }
  const candidateBytes=items.reduce((n,x)=>n+byteBudget(render(x)),0),candidateProjection=projectEvidence(items);
  let result;
  const reason=exact?'exact_requested':selection==='local'?'local_requested':!ctx.config.enabled?'disabled':candidateProjection.kind==='shared_lines'&&candidateProjection.displayBytes<=budget?'lossless_projection_fits':items.length<8?'small_candidate_set':candidateBytes<=Math.max(12000,budget)?'fits_context_budget':candidateBytes>90000?'candidate_bytes_limit':null;
  if(reason)result=localEvidence(ctx,goal,items,budget,reason);
  else{
    // These relevance questions are independent: do not expose the whole
    // candidate pool to every question. Other operations keep their old profile.
    ctx.judge.isolateItems=true;
    // Refuse unaffordable complete classification before paying; retain local evidence.
    // Evidence acquisition may replace several reads; do not impose the short
    // routing deadline on it. Keep the configured limit, capped at five seconds.
    ctx.judge.config={...ctx.judge.config,maxCalls:Math.min(2,ctx.judge.config.maxCalls),timeoutMs:Math.min(5000,ctx.judge.config.timeoutMs)};
    try{
      // Once classification is paid, preserve every surviving relevant/review
      // window. Prioritizing uncertain windows inside a hard display cap could
      // otherwise defer the clearest relevant sources and cause another read.
      result=await selectEvidence(ctx,{goal,items,budget:500000,requireCompleteJudgment:true});
      if(result.degraded)result={...localEvidence(ctx,goal,items,budget,'judgment_unavailable'),degraded:true};
      else {result.selection={method:'jev',reason:'large_semantic_candidates'};result.budget=budget;result.protectedOverflow=result.usedBytes>budget;}
    }catch(e){result=localEvidence(ctx,goal,items,budget,e.code??'judgment_unavailable');}
  }
  const search={queries,paths,matchedLines:matches,mergedCandidates:items.length,scannedFiles:scanned,enumeratedFiles:files.length,
    readBytes:bytes,candidateBytes,limited,skippedFileCount:skipped.length,matchedFiles:sources.length,
    scope:'Case-insensitive literal OR search in rg-visible text files only. Context windows are merged within a source snapshot. Not an exhaustive semantic review of the workspace.',
    recallScope:'Saved retrieved windows only; a recall miss does not prove absence elsewhere in a file or workspace.'};
  const projection=projectEvidence(result.items);
  // Exact requests retain verbatim windows; no semantic exclusions or line references.
  if(!exact&&projection.kind==='shared_lines'){
    result.context=projection.context;result.usedBytes=projection.displayBytes;result.protectedOverflow=projection.displayBytes>budget;
    result.projection={kind:projection.kind,rawBytes:projection.rawBytes,displayBytes:projection.displayBytes,dictionaryLines:Object.keys(projection.dictionary).length,lossless:true};
  }
  // Text consumers need retrieval limitations too, not only structured metadata.
  result.context=`Search: ${matches} matching lines → ${items.length} windows in ${sources.length} files; ${limited?'limits reached':'within limits'}; ${skipped.length} files skipped. Literal query scope only, not exhaustive semantic coverage. Recall searches saved windows; use native reads for gaps outside them.\n`+result.context;
  ctx.store.event(ctx.project,'investigation',{selection:result.selection,matchedLines:matches,candidates:items.length,scannedFiles:scanned,candidateBytes,limited,skippedFiles:skipped.length});
  return {...result,search};
}
