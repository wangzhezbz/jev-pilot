import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
export function summarize(events) {
  const excludedSyntheticEvents=events.filter(e=>e.measurementSource==='synthetic').length;
  events=events.filter(e=>e.measurementSource!=='synthetic');
  const latest=new Map();
  for(const e of events)if(e.kind==='turn_usage')latest.set(`${e.threadId}:${e.turnId}`,e);
  const turns=[...latest.values()],decisions=events.filter(e=>e.kind==='decision'),fallbacks=events.filter(e=>e.kind==='fallback');
  const models={};
  for(const t of turns){
    const m=models[t.targetModel]??={turns:0,knownUsageTurns:0,unknownUsageTurns:0,incompleteUsageTurns:0,usage:{}};
    m.turns++;
    if(!t.usage){m.unknownUsageTurns++;continue;}
    if(t.invalidUsageEvents){m.incompleteUsageTurns++;continue;}
    m.knownUsageTurns++;
    for(const [k,v] of Object.entries(t.usage))if(Number.isSafeInteger(v)&&v>=0)m.usage[k]=(m.usage[k]??0)+v;
  }
  const inputKnown=decisions.filter(e=>Number.isFinite(e.inputTokens));
  return {scope:'Observed runtime tokens and routing overhead; not a savings or account-debit measurement',
    turns:turns.length,completedTurns:turns.filter(t=>t.status==='completed').length,models,excludedSyntheticEvents,
    routing:{decisions:decisions.length,fallbacks:fallbacks.length,
      firstStepForwarded:decisions.filter(e=>e.status==='start_forwarded').length,
      nativeUpdatesApplied:decisions.filter(e=>e.status==='applied').length,
      retained:decisions.filter(e=>e.status==='unchanged').length,
      superseded:decisions.filter(e=>e.status==='superseded').length,
      knownLeaseSkips:turns.reduce((sum,t)=>sum+(t.leaseSkips??0),0),
      knownJevOutputTokens:decisions.reduce((sum,e)=>sum+(Number.isFinite(e.outputTokens)?e.outputTokens:0),0),
      unknownJevOutputCalls:decisions.filter(e=>!Number.isFinite(e.outputTokens)).length+fallbacks.length,
      medianDecisionMs:median(decisions.map(e=>e.elapsedMs)),
      observedWaitMs:[...decisions,...fallbacks].reduce((sum,e)=>sum+(Number.isFinite(e.elapsedMs)?e.elapsedMs:0),0),
      knownJevInputTokens:inputKnown.reduce((sum,e)=>sum+e.inputTokens,0),
      unknownJevUsageCalls:decisions.length-inputKnown.length+fallbacks.length},
    medianTurnWallMs:median(turns.map(t=>t.elapsedMs)),
    savings:{time:null,quota:null,reason:'No paired equal-quality baseline; reasoning tokens are already included in output tokens.'}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const path=process.argv[2]??join(homedir(),'.codex/jev-desktop/logs/events.jsonl');
  const events=[];let unreadableLines=0;
  for(const line of (await readFile(path,'utf8')).split('\n'))if(line.trim()){
    try{events.push(JSON.parse(line));}catch{unreadableLines++;}
  }
  console.log(JSON.stringify({...summarize(events),unreadableLines},null,2));
}
