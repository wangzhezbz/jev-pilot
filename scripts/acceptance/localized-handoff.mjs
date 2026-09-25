// Offline by default; --live permits a single small semantic context call.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Store,loadConfig,loadKey,Judge} from '../../src/core.mjs';
import {compactContext,recall} from '../../src/evidence.mjs';
import {modelResult} from '../../src/model-result.mjs';
import {installHome} from '../../src/setup.mjs';
const root=resolve('.'),out=resolve('dist/localization-handoff-20260925');mkdirSync(out,{recursive:true});
const live=process.argv.includes('--live'),rows=[];
const taskId=process.env.CODEX_THREAD_ID;if(live&&!taskId)throw Error('REAL_TASK_ID_REQUIRED');
const store=live?new Store():new Store({home:mkdtempSync(join(tmpdir(),'jev-handoff-audit-'))});
const project=store.project(root),config=loadConfig(store,project);
const phrases=['Completed read-only observation: each calibration sample uses the same measurement protocol and retains all original measurements.', '已完成的只读观测：每份校准样本使用同样的测量协议，保留全部原始测量值，并且不改变任何生产状态。','Завершённое наблюдение только для чтения: одинаковый протокол измерений сохраняет все исходные значения без изменения системы.'];
for(let i=0;i<(live?1:18);i++){
 const prefix=phrases[i%3],blocks=[];
 for(let j=0;j<6;j++)blocks.push({id:'call'+j,role:'tool_call',callId:'pair'+j,readOnly:true,verified:true,content:'Read sample '+j},{id:'result'+j,role:'tool_result',callId:'pair'+j,status:'completed',content:(prefix+'\n').repeat(i%2?8:4)+`Sample ${j}: value ${j===4?'unknown':(j*19+7)}; source ID M-${j}`} );
 blocks.push({id:'constraint',role:'system',pin:true,content:'Keep every sample and uncertainty. Do not infer an absent value.'},{id:'recent',role:'user',content:'Compare all calibration measurements and identify unknown values.'});
 if(i===17)blocks[1].content+='\nLiteral [=S0] marker';
 const ctx={store,project,config,judge:live?new Judge({store,project,config,key:loadKey(installHome()),taskId}):{key:'fixture',classify:async xs=>xs.map(x=>({id:x.id,source:'jev',choice:'review',probabilities:{review:1}}))}};
 const start=performance.now(),r=await compactContext(ctx,{goal:'Compare all calibration measurements and identify unknown values',blocks,preserveRecent:2,session:'localized-handoff-audit-'+i});
 const ms=performance.now()-start,wire=modelResult('compact',r),plain={...wire,context:r.blocks.map(b=>`[${b.role} ${b.id}]\n${b.content}`).join('\n\n'),presentation:'original'};
 const restored=recall(ctx,{artifactId:r.originalId}).items;
 const passed=r.blocks.length===blocks.length&&restored.every((x,j)=>x.content===blocks[j].content)&&r.context.includes('unknown')&&r.context.includes(blocks.at(-1).content);
 rows.push({case:i,passed,elapsedMs:ms,presentation:r.presentation,inputBytes:r.presentationInputBytes,outputBytes:r.presentationOutputBytes,wirePlainBytes:Buffer.byteLength(JSON.stringify(plain)),wireCandidateBytes:Buffer.byteLength(JSON.stringify(wire)),semanticOmissions:r.omittedCallIds,degraded:r.degraded,nativeHistoryChanged:r.nativeHistoryChanged});
}
const events=live?store.events(project,100).filter(e=>e.kind==='jev_call'&&e.taskId===taskId&&e.purpose==='context'):[];
const report={live,scope:'Component presentation and exact recall only; bytes are not GPT tokens; no native GPT AB or subscription savings',rows,passed:rows.every(r=>r.passed),contextCalls:events};
writeFileSync(join(out,live?'context-live.json':'context-offline.json'),JSON.stringify(report,null,2));store.close();console.log(JSON.stringify({passed:report.passed,rows},null,2));if(!report.passed)process.exitCode=1;
