import {readFileSync} from 'node:fs';
import {join} from 'node:path';
// Whitelist metadata: never return raw tool output, credentials, task text or paths.
const fields=['at','kind','threadId','turnId','event','targetModel','from','recommended','published','status','code','reason','elapsedMs','inputTokens','outputTokens','recommendedHorizon','horizon','horizonReason','confirmation'];
export function activity(ctx,input={}) {
 const rows=[];let legacyUnscoped=0;
 try{for(const line of readFileSync(join(ctx.store.home,'runtime/desktop/logs/events.jsonl'),'utf8').split('\n')){let e;try{e=JSON.parse(line)}catch{continue;}
  if(e.measurementSource==='synthetic'||!e.threadId)continue;
  if(!e.projectId){legacyUnscoped++;continue;}
  if(e.projectId!==ctx.project||input.threadId&&e.threadId!==input.threadId)continue;
  if(['decision','fallback','effort_restore','external_settings'].includes(e.kind))rows.push(Object.fromEntries(fields.filter(k=>e[k]!==undefined).map(k=>[k,e[k]])));
 }}catch{}
 return {scope:'project',events:rows.slice(-100).reverse(),total:rows.length,limit:100,legacyUnscoped,savings:null};
}
