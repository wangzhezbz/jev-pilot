import {execFileSync} from 'node:child_process';
export function processTable(pids,{platform=process.platform,exec=execFileSync}={}){
 const ids=[...new Set(pids.filter(p=>Number.isInteger(p)&&p>0))];if(!ids.length)return new Map();
 try{
  if(platform==='win32'){
   const script=`@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(',')}) } | ForEach-Object { @{pid=$_.ProcessId;parentPid=$_.ParentProcessId;startedAt=$_.CreationDate.ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress`;
   const raw=exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:3000,windowsHide:true,stdio:['ignore','pipe','ignore']});const rows=JSON.parse(raw||'[]');return new Map((Array.isArray(rows)?rows:[rows]).map(x=>[x.pid,{parentPid:x.parentPid,startedAt:Date.parse(x.startedAt)}]));
  }
  const raw=exec('ps',['-p',ids.join(','),'-o','pid=,ppid=,lstart='],{encoding:'utf8',timeout:1500,env:{...process.env,LC_ALL:'C',TZ:'UTC'},stdio:['ignore','pipe','ignore']});
  return new Map(raw.split('\n').map(line=>/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line)).filter(Boolean).map(m=>[Number(m[1]),{parentPid:Number(m[2]),startedAt:Date.parse(m[3]+' UTC')}]));
 }catch{return new Map();}
}
export function bridgeIdentity(record,table){
 const bridge=table.get(record.pid),backend=table.get(record.backendPid);
 if(!bridge||!backend)return 'unverified';
 if(backend.parentPid!==record.pid)return 'pid_reused';
 const logged=Date.parse(record.at);
 if(Number.isFinite(logged)&&Number.isFinite(bridge.startedAt)&&Number.isFinite(backend.startedAt)){
  if(bridge.startedAt>logged+1000||backend.startedAt>logged+1000)return 'pid_reused';
 }
 return 'verified';
}
