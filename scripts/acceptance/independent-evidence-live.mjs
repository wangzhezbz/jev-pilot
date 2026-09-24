import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {Store,Judge,loadConfig,loadKey,hash} from '../../src/core.mjs';
import {installHome} from '../../src/setup.mjs';
import {jevRequestCost} from '../../src/cost.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/independent-evidence-20260924');await mkdir(out,{recursive:true});
const narratives=[
 ['keep','Inspectors record new measurements inside disconnected tunnels. Save them on the device and synchronize them to the application when reception returns.'],
 ['exclude','Managers download signed reports for reading while travelling. Editing happens only at the connected office.'],
 ['review','The request says offline mode but does not specify whether records are read or edited or synchronized.'],
 ['keep','Nurses enter new visit notes with no reception, keep them on the handset, and send the notes into the shared patient record later.'],
 ['exclude','Analysts export a spreadsheet and email their edited copy. Synchronization into the application is explicitly out of scope.'],
 ['exclude','Server jobs keep running after the browser closes; all servers stay connected. Disconnected client entry is not requested.'],
 ['exclude','The dashboard should refresh faster while a stable connection is available. Offline operation is explicitly excluded.'],
 ['keep','Inventory adjustments are entered inside a radio-shielded room, queued locally and uploaded to the application at the dock.'],
 ['review','A supervisor requests mobile resilience. The note gives no behavior for lost connections or later synchronization.'],
 ['exclude','Documents are downloaded before departure and remain immutable. Workers only read the saved documents.'],
 ['exclude','A printer should retain jobs when its cable is unplugged. No offline creation or synchronization of application records is involved.'],
 ['keep','A ship crew creates equipment records at sea without data service and merges their queued records into the central application in port.']
];
const goal='Determine whether the request requires creating or editing application records on a disconnected device and subsequently synchronizing those new records to the application server.';
const criteria={keep:'Explicitly requires all these behaviors.',review:'Ambiguous: the text does not establish whether all are required.',exclude:'Clearly a different request or explicitly excludes one of these behaviors.'};
const items=narratives.map(([label,text],i)=>({id:'r'+i,source:'note-'+i,text:text+'\n'+Array.from({length:24},(_,j)=>`Administrative reference ${i}-${j}: The staff handbook describes office opening hours and the document filing scheme. These details add no functional requirements.`).join('\n')}));
const protocol={at:new Date().toISOString(),order:['shared','isolated','isolated','shared'],maxPaidRequests:10,sourceHash:hash(items),oracle:narratives.map(x=>x[0]),retries:0,gptCalls:0,scope:'Synthetic per-record semantic decisions. ABBA plus initial/reordered/one-item-changed cache validation; component evidence only, not full-task speed.'};
await writeFile(out+'/protocol.json',JSON.stringify(protocol,null,2),{flag:'wx'});
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const rows=[];
async function run(profile,cacheMs,store,records=items){
 const project='fixture',config={...loadConfig(store,project),cacheMs,maxCalls:3},judge=new Judge({store,project,config,key,concurrency:2});judge.isolateItems=profile==='isolated';
 const before=store.events(project,10000).length,start=performance.now(),answers=await judge.classify(records,goal,criteria,'evidence');
 const events=store.events(project,10000).slice(0,store.events(project,10000).length-before),calls=events.filter(e=>e.kind==='jev_call');
 const correct=answers.every(x=>x.source==='jev'&&x.choice===narratives[Number(x.id.slice(1))][0]);
 const row={profile,cacheMs,elapsedMs:performance.now()-start,questionsPaid:calls.reduce((s,e)=>s+(e.questions??0),0),calls,cacheHits:events.filter(e=>e.kind==='item_cache_hit'),correct,answers,timings:events.filter(e=>e.kind==='transport_timing'),knownUsd:calls.reduce((s,e)=>s+(jevRequestCost(e.model,e.inputTokens).usd??0),0),unknownUsage:calls.filter(e=>e.inputTokens==null).length};
 rows.push(row);await writeFile(out+'/results.json',JSON.stringify({protocol,rows},null,2));console.log(JSON.stringify({profile,cacheMs,ms:row.elapsedMs,calls:calls.length,questionsPaid:row.questionsPaid,correct,usd:row.knownUsd}));
 if(calls.some(c=>c.status!=='success'))throw Error('LIVE_FAILURE_STOP');
}
for(const arm of protocol.order){const store=new Store({home:await mkdtemp(join(tmpdir(),'jev-independent-'))});try{await run(arm,0,store);}finally{store.close();}}
const store=new Store({home:await mkdtemp(join(tmpdir(),'jev-item-live-'))});
try{await run('isolated',60000,store);await run('isolated',60000,store,[...items].reverse());await run('isolated',60000,store,items.map((r,i)=>i===3?{...r,text:r.text+'\nA second nurse confirms the same entry and synchronization requirement.'}:r));}finally{store.close();}
if(rows.some(r=>!r.correct))process.exitCode=1;
