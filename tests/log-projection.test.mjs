import test from 'node:test';
import assert from 'node:assert/strict';
import {projectLogTemplates,expandLogTemplates} from '../src/log-projection.mjs';
const lines=Array.from({length:100},(_,i)=>`L${String(i).padStart(5,'0')} worker routine sample zone=${i%3} batch=${i} queue=0 heartbeat=normal product=catalog trace=background-${i%7}-${i}\r`);
const make=()=>lines.map((text,i)=>({id:'r'+i,source:'service.log',startLine:i+1,endLine:i+1,text,sourceHash:'fixture'}));
test('numeric log projection preserves leading zeros, every value, CRLF and evidence metadata',()=>{
 const items=make(),before=JSON.stringify(items);items[38].text='L00038 WARNING queue=009 zone=0 requests=80 failures=12 settlement=unknown';
 const p=projectLogTemplates(items);
 assert.equal(p.kind,'log_templates');assert.deepEqual(expandLogTemplates(p),items);
 assert(p.context.includes('WARNING queue=009'));assert(p.context.includes('settlement=unknown'));
 assert(Buffer.byteLength(p.context)<Buffer.byteLength(before)*.5);
 assert.equal(items[0].text,lines[0]);
});
test('numeric log projection round-trips arbitrary digit lengths, signs and decimal lexemes',()=>{
 const items=make().map((x,i)=>({...x,text:x.text+` offset=-00${i}.500 rate=1e-${i} note=unchanged`}));
 const p=projectLogTemplates(items);assert.equal(p.kind,'log_templates');assert.deepEqual(expandLogTemplates(p),items);
});
test('code, marker collisions, literal placeholder collisions and short unique logs stay original',()=>{
 for(const suffix of ['[=N0 001|2]','{#1}']){const items=make();items[0].text+=suffix;assert.equal(projectLogTemplates(items).kind,'original');}
 for(const source of ['main.js','table.csv','notes.md'])assert.equal(projectLogTemplates(make().map(x=>({...x,source}))).kind,'original');
 assert.equal(projectLogTemplates(make().slice(0,3)).kind,'original');
});
