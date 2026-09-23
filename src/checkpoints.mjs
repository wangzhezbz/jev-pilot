import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {inside,hash,now,redact} from './core.mjs';
import {isContinuation} from '../runtime/desktop/router.mjs';
const exec=promisify(execFile),MAX_BYTES=1000000;
async function sourceHash(root,path) {
 const file=await open(inside(root,path),'r');
 try {
  const stat=await file.stat();if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('SOURCE_LIMIT');
  const data=Buffer.alloc(MAX_BYTES+1);let length=0;
  while(length<data.length){const {bytesRead}=await file.read(data,length,data.length-length,null);if(!bytesRead)break;length+=bytesRead;}
  if(length>MAX_BYTES||data.subarray(0,length).includes(0))throw new Error('SOURCE_LIMIT');
  return hash(new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(0,length)));
 }finally{await file.close();}
}
export async function worktreeSnapshot(root) {
 const sourceHashes={},skipped=[];let paths;
 try {
  const run=async args=>(await exec('git',['-C',root,...args],{encoding:'utf8',timeout:500,maxBuffer:128000,windowsHide:true})).stdout.split('\0').filter(Boolean);
  paths=[...new Set((await Promise.all([run(['diff','--relative','--name-only','-z','HEAD','--','.']),run(['ls-files','--others','--exclude-standard','-z','--','.'])])).flat())];
 }catch{return{sourceHashes,coverage:'unavailable',skippedCount:null};}
 for(const path of paths.slice(0,40))try{sourceHashes[path]=await sourceHash(root,path);}catch{skipped.push(path);}
 return{sourceHashes,coverage:paths.length>40||skipped.length?'partial':'worktree_changes',skippedCount:skipped.length+Math.max(0,paths.length-40)};
}
export function checkpointRelevant(message) {
 const p=message?.params;
 return (message?.method==='turn/plan/updated'&&Array.isArray(p?.plan)) ||
  (message?.method==='item/completed'&&['agentMessage','commandExecution'].includes(p?.item?.type)) ||
  (message?.method==='turn/completed'&&Boolean(p?.turn?.id));
}
const text=value=>redact(String(value??'')).slice(0,1000);
export function checkpointForTurn(saved,t) {
 if(saved?.turnId===t.turnId&&saved?.threadId===t.threadId)return saved;
 const inherited=saved ? {sourceTurnId:saved.turnId??null,observedAt:saved.updatedAt??saved.createdAt,
  task:text(saved.task),pending:(saved.pending??[]).slice(0,10).map(text),lastPublishedProgress:text(saved.lastPublishedProgress)} : undefined;
 const age=Date.now()-Date.parse(saved?.updatedAt??saved?.createdAt);
 const historicalTask=isContinuation(t.task)&&age>=0&&age<=86400000 ? saved.historicalTask??{text:text(saved.task),sourceTurnId:saved.turnId??null} : undefined;
 return {task:text(t.task),threadId:t.threadId,turnId:t.turnId,createdAt:now(),completed:[],pending:[],receiptIds:[],sourceHashes:{},toolReceipts:[],...(inherited?{inherited}:{}),...(historicalTask?{historicalTask}:{}),auto:true,requiresReview:true};
}
export function checkpointObserver(store,{snapshot=worktreeSnapshot}={}) {
 const pending=new Set();
 const observe=(message,t)=>{
  if(!checkpointRelevant(message)||!t?.cwd||!t.threadId||!t.turnId)return;
  const p=message.params;if(p.threadId&&p.threadId!==t.threadId)return;
  if(message.method==='turn/completed'&&p.turn.id!==t.turnId)return;if(p.turnId&&p.turnId!==t.turnId)return;
  const project=store.project(t.cwd),id='auto-'+hash(t.threadId),stamp=now(),source={turnId:t.turnId,observedAt:stamp};
  let saved=checkpointForTurn(store.get(project,'checkpoint',id),t);
  if(message.method==='turn/plan/updated')saved={...saved,plan:redact(p.plan.slice(0,30)),planSource:source,pending:redact(p.plan.filter(x=>x.status!=='completed').map(x=>String(x.step).slice(0,1000)).slice(0,30))};
  else if(message.method==='item/completed'&&p.item.type==='agentMessage')saved={...saved,lastPublishedProgress:redact(p.item.text||'').slice(0,2000),progressSource:source};
  else if(message.method==='item/completed')saved={...saved,toolReceipts:[...(saved.toolReceipts||[]),{id:p.item.id,status:p.item.status,exitCode:p.item.exitCode??null,...source}].slice(-20)};
  else saved={...saved,turnStatus:p.turn.status,snapshotStatus:'pending',snapshotSource:source,snapshotVersion:randomUUID()};
  store.put(project,'checkpoint',{...saved,task:text(t.task),updatedAt:stamp},id);
  if(message.method!=='turn/completed')return;
  const version=saved.snapshotVersion;
  const job=Promise.resolve().then(()=>snapshot(t.cwd)).catch(()=>({sourceHashes:{},coverage:'unavailable',skippedCount:null})).then(result=>{
   const current=store.get(project,'checkpoint',id);
   if(current?.turnId===t.turnId&&current.snapshotVersion===version)
    store.put(project,'checkpoint',{...current,...result,snapshotStatus:result.coverage==='unavailable'?'unavailable':'ready',updatedAt:now()},id);
  }).finally(()=>pending.delete(job));
  pending.add(job);return job;
 };
 observe.flush=()=>Promise.allSettled([...pending]);return observe;
}
export async function resumeContext(store,root,threadId,currentTask,{clock=Date.now,maxAgeMs=86400000}={}) {
 // Only short continuation requests inherit historical context automatically.
 if(!isContinuation(currentTask))return;
 const saved=store.get(store.project(root),'checkpoint','auto-'+hash(threadId));
 const age=clock()-Date.parse(saved?.updatedAt??saved?.createdAt);
 if(saved?.threadId!==threadId||!saved.turnId||!Number.isFinite(age)||age<0||age>maxAgeMs)return;
 const changed=[];
 for(const [path,expected] of Object.entries(saved.sourceHashes??{}).slice(0,40))try{if(await sourceHash(root,path)!==expected)changed.push(path);}catch{changed.push(path);}
 const stale=changed.length>0;
 return {source:'checkpoint',sourceTurnId:saved.turnId,observedAt:saved.updatedAt??saved.createdAt,requiresReview:true,
  task:text(saved.historicalTask?.text??saved.task),taskSourceTurnId:saved.historicalTask?.sourceTurnId??saved.turnId,progress:stale?[]:[text(saved.lastPublishedProgress)].filter(Boolean),pending:stale?[]:(saved.pending??[]).slice(0,10).map(text),
  validation:{changedFilesCount:changed.length,coverage:saved.coverage??'unavailable',snapshotStatus:saved.snapshotStatus??'unknown',historicalOnly:true}};
}
