// One small paid Jev component check; no GPT inference, synthetic source only.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Pilot} from '../../src/pilot.mjs';
import {Store,loadKey} from '../../src/core.mjs';
import {installHome} from '../../src/setup.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required: this check calls the paid Jev API.');
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'dist/same-cell-live');mkdirSync(out,{recursive:true});
const root=mkdtempSync(join(tmpdir(),'jev-presentation-live-')),store=new Store({home:join(root,'private')});
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const pilot=new Pilot({store,key});
const topics=[
 'The cafeteria planned a seasonal lunch menu and ordered table decorations for the office gathering.',
 'The garden group compared flower colours and allocated planting beds near the outdoor seating area.',
 'A shopper repeated checkout while the first charge confirmation was delayed; the second submission created another payment with a different deduplication key.',
 'The library group selected fiction titles and arranged the bookshelves for the upcoming reading club.',
 'The sports group chose shirt colours and reserved the practice field for next month training sessions.',
 'The art group arranged photographs and discussed picture frame sizes for the corridor exhibition.',
];
const groups=topics.map((topic,g)=>Array.from({length:30},(_,i)=>`Observation ${g}-${i}: ${topic}`));
const value={output:groups.flat().join('\n'),exit_code:0,wall_time_seconds:.01};
const started=performance.now();
try{
 const prepared=await pilot.call({workspace:root,operation:'prepare_output',input:{goal:'Find observations explaining how one shopper could be charged twice during checkout.',value,source:'billing-observations.log',taskId:'same-cell-component'}});
 const elapsedMs=Math.round(performance.now()-started),artifactId=prepared.selection.artifactId;
 const recalled=artifactId?await pilot.call({workspace:root,operation:'recall_output',input:{artifactId}}):null;
 const events=store.events(store.project(root)),calls=events.filter(e=>e.kind==='jev_call');
 const report={at:new Date().toISOString(),kind:'paid_jev_component',gptCalls:0,elapsedMs,selection:prepared.selection,
  sourceBytes:Buffer.byteLength(JSON.stringify(value)),deliveredBytes:Buffer.byteLength(JSON.stringify(prepared)),
  allTargetFactsRetained:groups[2].every(line=>prepared.value.output.includes(line)),
  rawCallerUnchanged:value.output===groups.flat().join('\n'),
  recallExact:recalled?JSON.stringify(recalled.value)===JSON.stringify(value):null,
  originalFallbackExact:prepared.selection.status==='original'?JSON.stringify(prepared.value)===JSON.stringify(value):null,
  calls,scope:'Component only; no GPT token, desktop latency or subscription billing measurement. Excludes background task routing.'};
 report.passed=report.allTargetFactsRetained&&report.rawCallerUnchanged&&(report.recallExact||report.originalFallbackExact);
 writeFileSync(join(out,'live.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{pilot.close();}
