import {execFileSync} from 'node:child_process';
import {readSource,hash,now,redact} from './core.mjs';
export function worktreeSnapshot(root) {
 const sourceHashes={},skipped=[];let paths;
 try {
  const run=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:500,maxBuffer:128000,stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);
  paths=[...new Set([...run(['diff','--relative','--name-only','-z','HEAD','--','.']),...run(['ls-files','--others','--exclude-standard','-z','--','.'])])];
 }catch{return{sourceHashes,coverage:'unavailable',skippedCount:null};}
 for(const path of paths.slice(0,40))try{sourceHashes[path]=readSource(root,path).hash;}catch{skipped.push(path);}
 return{sourceHashes,coverage:paths.length>40||skipped.length?'partial':'worktree_changes',skippedCount:skipped.length+Math.max(0,paths.length-40)};
}
export function checkpointObserver(store) {
 return (message,t)=>{
  if(!t?.cwd||!t.threadId)return;
  const p=message.params;if(message.method==='turn/completed'&&t.turnId&&p.turn?.id!==t.turnId)return;if(p?.turnId&&t.turnId&&p.turnId!==t.turnId)return;
  const project=store.project(t.cwd),id='auto-'+hash(t.threadId);
  let saved=store.get(project,'checkpoint',id)??{task:t.task,completed:[],pending:[],receiptIds:[],sourceHashes:{}};
  if(message.method==='turn/plan/updated'&&Array.isArray(p.plan))saved={...saved,plan:redact(p.plan.slice(0,30)),pending:redact(p.plan.filter(x=>x.status!=='completed').map(x=>x.step).slice(0,30))};
  else if(message.method==='item/completed'&&p.item?.type==='agentMessage')saved={...saved,lastPublishedProgress:redact(p.item.text||'').slice(0,2000)};
  else if(message.method==='item/completed'&&p.item?.type==='commandExecution')saved={...saved,toolReceipts:[...(saved.toolReceipts||[]),{id:p.item.id,status:p.item.status,exitCode:p.item.exitCode??null}].slice(-20)};
  else if(message.method==='turn/completed')saved={...saved,...worktreeSnapshot(t.cwd),turnStatus:p.turn.status};
  else return;
  store.put(project,'checkpoint',{...saved,task:redact(t.task),threadId:t.threadId,turnId:t.turnId,createdAt:now(),auto:true,requiresReview:true},id);
 };
}
