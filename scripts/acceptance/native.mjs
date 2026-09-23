// Original native engine + synthetic inference. Never interpreted as paid-model performance.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const out=resolve(process.argv.find(x=>x.startsWith('--out='))?.slice(6)||'dist/acceptance-native');await mkdir(out,{recursive:true});
const jobs=[['code-mode-select',['--code-mode-select']],['code-mode-chain',['--code-mode-chain']],['code-mode-failure',['--code-mode-chain-failure']],['code-mode-passthrough',['--code-mode-output']],['steer-context',['--steer-context']],['phase-reevaluation',['--phase-reevaluation']],['astra',['--routing-budget','--model=gpt-6-astra']],['sol',['--routing-budget','--model=gpt-6-sol','--use-local-catalog']],['luna',['--routing-budget','--model=gpt-6-luna','--use-local-catalog']],['56sol',['--reassess','--model=gpt-5.6-sol','--use-local-catalog']],['56terra',['--reassess','--model=gpt-5.6-terra','--use-local-catalog']],['56luna',['--reassess','--model=gpt-5.6-luna','--use-local-catalog']],['manual',['--manual-settings']],['recovery',['--recover-timeout']],['context',['--resume-context']],['parallel',['--parallel-tools']],['mcp-filter',['--filter-mcp']],['no-benefit',['--no-benefit-filter']],['unavailable',['--unavailable-jev']],['disabled',['--disabled']],['incompatible',['--incompatible']]];
for(const model of ['gpt-6-astra','gpt-6-sol','gpt-6-luna','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'])jobs.push(['cache-'+model,['--phase-reevaluation','--model='+model,'--use-local-catalog','--inspect-cache-context','--adapter-cache-default','--openai-provider-fixture']]);
const rows=[];
for(const [id,args]of jobs){let stdout='',stderr='';const p=spawn(process.execPath,['scripts/verify-desktop.mjs',...args],{stdio:['ignore','pipe','pipe']});p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>p.kill(),90000);const code=await new Promise(r=>p.on('exit',r));clearTimeout(timer);let result;for(const line of stdout.trim().split('\n'))try{result=JSON.parse(line);}catch{}
 let r;try{r=JSON.parse(await readFile(result.report,'utf8'));}catch{}
 const fields=['kind','status','code','from','published','recommended','confirmation','recoveryScheduled','retryAfterMs','horizon','targetModel','elapsedMs'];
 rows.push({id,args,exitCode:code,passed:code===0,result:result?Object.fromEntries(Object.entries(result).filter(([k])=>!['report','work'].includes(k))):null,requests:r?.requests?.map(x=>({number:x.number,model:x.model,effort:x.effort})),cacheContext:r?.cacheContext,events:r?.audit?.map(x=>Object.fromEntries(fields.filter(k=>k in x).map(k=>[k,x[k]]))),error:code!==0?stderr.slice(-1200):undefined});
 await writeFile(join(out,'native.json'),JSON.stringify({at:new Date().toISOString(),kind:'real_native_engine_synthetic_model',paidModelCalls:0,rows},null,2));console.log(JSON.stringify({id,passed:code===0}));
}
if(rows.some(x=>!x.passed))process.exitCode=1;
