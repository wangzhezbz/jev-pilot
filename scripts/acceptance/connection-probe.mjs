// Explicit, bounded transport experiment: six tiny judgments, no GPT calls.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadKey,transport,validateAnswers} from '../../src/core.mjs';
import {installHome} from '../../src/setup.mjs';
import {measuredTransport} from './transport-timing.mjs';
if(!process.argv.includes('--run'))throw Error('EXPLICIT_RUN_REQUIRED');
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)??'dist/connection-probe-20260924');await mkdir(out,{recursive:true});
const protocol={at:new Date().toISOString(),order:['curl','pool','pool','curl','pool','pool'],maxPaidCalls:6,gptCalls:0,timeoutMs:5000,retries:0,scope:'Identical tiny judgments; cold curl process versus process-local pooled HTTPS. Component transport measurement, not whole-task acceleration.'};
await writeFile(out+'/protocol.json',JSON.stringify(protocol,null,2),{flag:'wx'});
const key=loadKey(installHome());if(!key)throw Error('MISSING_KEY');
const payload={model:'jev-1.13.0',state:'The exact color is blue.',questions:{color:{type:'choice',instructions:'Select the literal color.',criteria:{blue:null,red:null}}}},rows=[];
for(const arm of protocol.order){
 const timings=[],start=performance.now();let row={arm};
 try{const send=arm==='curl'?measuredTransport(x=>timings.push(x)):transport;
  const r=validateAnswers(payload.questions,await send(payload,key,{timeoutMs:5000,onTiming:x=>timings.push(x)}));row={...row,passed:r.answers.color.choice==='blue',model:r.model,usage:r.usage};
 }catch(e){row={...row,passed:false,error:e.code??e.message,usage:null};}
 row.elapsedMs=performance.now()-start;row.timings=timings;rows.push(row);await writeFile(out+'/results.json',JSON.stringify({protocol,rows},null,2));console.log(JSON.stringify(row));
}
