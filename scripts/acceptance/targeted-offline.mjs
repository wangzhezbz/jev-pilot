// No network: reversible prose and source-scope verification before live tests.
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {holdoutTasks} from './holdout-tasks.mjs';
import {projectEvidence,expandEvidenceProjection} from '../../src/evidence-projection.mjs';
const oldRoot=resolve(process.argv[2]),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
let checks=0;
for(let n=0;n<160;n++){
 const phrase=[
  'A repeated observation never replaces a later correction; preserve every individual occurrence and its source identity.',
  '这些记录保留原始来源和每一次出现的位置，不能把待核验的陈述当作已经完成的实际结果，也不能把相似描述当作相同事件。',
  'Каждая запись сохраняет исходный контекст и все повторения; предположение не является подтвержденным результатом.'
 ][n%3];
 const items=Array.from({length:12+n%19},(_,i)=>({id:'r'+i,source:n%11===0?'code.mjs':'notes.md',startLine:i*4+1,endLine:i*4+4,text:`Record ${i}\n${phrase}${n%2?'\t  ':' '}${phrase}\n${i===n%11?'Correction: previous observation no longer applies.':'Status: unresolved.'}${n%4===0?'\r':''}${n%13===0?' [=S0]':''}\n`}));
 const before=JSON.stringify(items),p=projectEvidence(items,{fragments:true});
 assert.deepEqual(expandEvidenceProjection(p),items);assert.equal(JSON.stringify(items),before);checks++;
}
const source=holdoutTasks.find(t=>t.id==='holdout_eligibility').files['requests.md'],rows=[];
for(const [label,root] of [['frozen_v19',oldRoot],['candidate',resolve('.')]]){
 const {Pilot}=await import(pathToFileURL(join(root,'src/pilot.mjs'))),{Store}=await import(pathToFileURL(join(root,'src/core.mjs')));
 const workspace=await mkdtemp(join(tmpdir(),'jev-offline-net-')),store=new Store({home:join(workspace,'state')});let paidAttempts=0;
 const pilot=new Pilot({store,key:'fixture',send:async()=>{paidAttempts++;throw Error('OFFLINE_ONLY');}});
 const result=await pilot.call({workspace,operation:'prepare_output',input:{goal:'Review all requests and cite eligible IDs and exclusions',source:'requests.md',value:source}});
 assert.equal(result.selection.reason,'lossless_projection');assert.equal(paidAttempts,0);
 const recalled=await pilot.call({workspace,operation:'recall_output',input:{artifactId:result.selection.artifactId}});assert.equal(recalled.value,source);
 for(let i=0;i<90;i++)assert(result.value.includes('CASE-'+String(i).padStart(3,'0')));
 rows.push({label,originalWireBytes:Buffer.byteLength(JSON.stringify(source)),preparedWireBytes:Buffer.byteLength(JSON.stringify(result)),completeCoverage:result.selection.completeCoverage,excludedItems:result.selection.excludedItems,lossless:result.selection.lossless,paidAttempts});
 await pilot.close();
}
const report={scope:'Offline exact-byte preservation and presentation size only, not measured GPT tokens or latency.',roundTrips:checks,rows,reductionVsV19Percent:100*(1-rows[1].preparedWireBytes/rows[0].preparedWireBytes)};
await writeFile(join(out,'offline.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
