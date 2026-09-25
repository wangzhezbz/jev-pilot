// Deterministic synthetic round-trip audit. No model or network calls.
import assert from 'node:assert/strict';
import {projectLogTemplates,expandLogTemplates} from '../../src/log-projection.mjs';
let seed=20260925;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const totals={cases:240,projected:0,withBlocks:0,original:0,failures:0,maxMs:0};
for(let n=0;n<totals.cases;n++){
 const count=80+random()%121,crlf=n%2===0?'\r':'',width=n%7;
 const lines=Array.from({length:count},(_,i)=>{
  let value=n%3===0?String(random()%9000):n%3===1?String(i%17):String(count-i);
  if(n%5===0)value=String(9007199254740991000n+BigInt(i));
  return `L${String(i).padStart(5,'0')} worker 服务 routine measurement region=${n%9} value=${value.padStart(width,'0')} offset=-00${i}.500 queue=${i%3} trace=${i}${crlf}`;
 });
 for(const i of [13,51])lines[i]=`L${String(i).padStart(5,'0')} WARNING 根因未定 requests=080 failures=012 settlement=unknown${crlf}`;
 const items=[{id:'s0',source:'test.log',startLine:1,endLine:count,text:lines.join('\n')}];const before=JSON.stringify(items),start=performance.now(),p=projectLogTemplates(items);totals.maxMs=Math.max(totals.maxMs,performance.now()-start);
 assert.equal(JSON.stringify(items),before);
 if(p.kind==='original')totals.original++;else{totals.projected++;if(Object.keys(p.blocks).length)totals.withBlocks++;assert.deepEqual(expandLogTemplates(p),items);assert(p.context.includes('WARNING 根因未定'));}
}
console.log(JSON.stringify(totals,null,2));
