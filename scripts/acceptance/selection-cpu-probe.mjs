// Isolated local computation, mocked decisions, bounded child lifetime.
import {spawnSync} from 'node:child_process';import {writeFileSync,mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
if(process.argv.includes('--worker')){
 const {Store}=await import('../../src/core.mjs');const {selectEvidence}=await import('../../src/evidence.mjs');
 const n=Number(process.argv.at(-1)),store=new Store({home:mkdtempSync(join(tmpdir(),'jev-sort-probe-'))});
 const ctx={store,project:'fixture',config:{},judge:{classify:async items=>items.map(x=>({id:x.id,choice:'keep',source:'jev',probabilities:{keep:1,exclude:0,review:0}}))}};
 const items=Array.from({length:n},(_,i)=>({id:'i'+i,text:`Record ${i} `+'common evidence alpha beta gamma delta '.repeat(6)}));
 const start=performance.now();const r=await selectEvidence(ctx,{goal:'Review records',items,budget:500000});console.log(JSON.stringify({n,elapsedMs:Math.round(performance.now()-start),retained:r.items.length}));store.close();
}else{
 const rows=[];for(const n of [40,80,160]){
  const r=spawnSync(process.execPath,[import.meta.filename,'--worker',String(n)],{encoding:'utf8',timeout:8000});
  rows.push(r.status===0?JSON.parse(r.stdout):{n,timeout:r.error?.code==='ETIMEDOUT',exitCode:r.status});
 }
 writeFileSync('docs/reports/deep-audit-20260923/selection-cpu.json',JSON.stringify({kind:'local_cpu_only_mock_judgments',paidApiCalls:0,rows},null,2)+'\n');console.log(JSON.stringify(rows));
}
