// Exact local source windows. No model call, semantic omission or command execution.
import {readSource,requireValue,hash,byteBudget,now} from './core.mjs';
export function readWindow(ctx,{path,artifactId,startLine=1,maxLines=80,budget=12000}={}) {
  requireValue((typeof path==='string')!==(typeof artifactId==='string'),'ONE_READ_SOURCE_REQUIRED');
  requireValue(Number.isSafeInteger(startLine)&&startLine>=1,'INVALID_LINE');
  requireValue(Number.isSafeInteger(maxLines)&&maxLines>=1&&maxLines<=400,'INVALID_LINE_COUNT');
  requireValue(Number.isSafeInteger(budget)&&budget>=1024&&budget<=100000,'INVALID_DISPLAY_BUDGET');
  requireValue(!ctx.judge.signal?.aborted,'CANCELLED');
  let snapshot;
  if(path!==undefined){
    requireValue(path.length>0&&path.length<=1000,'INVALID_PATH');
    const source=readSource(ctx.root,path);
    artifactId=hash({kind:'exact-source-window-v1',path:source.path,hash:source.hash});
    snapshot={...source,createdAt:now()};ctx.store.put(ctx.project,'source_snapshot',snapshot,artifactId);
  }else{
    requireValue(artifactId.length===64&&/^[a-f0-9]+$/.test(artifactId),'ARTIFACT_REQUIRED');
    snapshot=ctx.store.get(ctx.project,'source_snapshot',artifactId);
    requireValue(snapshot&&typeof snapshot.text==='string','ARTIFACT_NOT_FOUND');
  }
  // Retain terminators, whitespace and the last unterminated line verbatim.
  const lines=snapshot.text.match(/[^\n]*\n|[^\n]+$/g)||[];
  requireValue(startLine<=Math.max(1,lines.length),'LINE_OUT_OF_RANGE');
  let result={source:snapshot.path,sourceHash:snapshot.hash,artifactId,startLine,endLine:startLine-1,totalLines:lines.length,
    text:'',nextLine:lines.length?startLine:null,completeFile:lines.length===0,status:'page',
    scope:'Exact source snapshot excerpt, not a relevance judgment. Unread lines may contain errors or required context. Continue with read {artifactId,startLine:nextLine}; use path for a fresh snapshot.'};
  requireValue(byteBudget(JSON.stringify(result))<=budget,'DISPLAY_BUDGET_TOO_SMALL');
  for(let i=startLine-1;i<Math.min(lines.length,startLine-1+maxLines);i++){
    const next={...result,text:result.text+lines[i],endLine:i+1,nextLine:i+1<lines.length?i+2:null,completeFile:startLine===1&&i+1===lines.length};
    if(byteBudget(JSON.stringify(next))>budget)break;
    result=next;
  }
  if(lines.length&&!result.text){
    result.status='line_exceeds_budget';
    result.scope='The next single line exceeds this display budget; no source text was returned. Use a larger budget or a bounded native character lookup. Do not repeat the same page or infer absence.';
  }
  requireValue(byteBudget(JSON.stringify(result))<=budget,'DISPLAY_BUDGET_TOO_SMALL');
  ctx.store.event(ctx.project,'source_window',{sourceHash:snapshot.hash,startLine,endLine:result.endLine,totalLines:lines.length,returnedBytes:byteBudget(JSON.stringify(result)),sourceBytes:byteBudget(snapshot.text),status:result.status,nativeTokenSavings:null});
  return result;
}
