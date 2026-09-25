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

test('constant numeric columns are literal, variable lexemes remain explicit',()=>{
 const items=make().map((x,i)=>({...x,text:`prefix2026 routine worker zone=009 queue=000 count=${i} rate=-01.500 leading=${i%2?'00':'0'} trailing=7777777`}));
 const p=projectLogTemplates(items);assert.equal(p.kind,'log_templates');
 assert.deepEqual(expandLogTemplates(p),items);
 assert(p.context.includes('zone=009 queue=000'));assert(p.context.includes('rate=-01.500'));
 assert.equal(p.dictionary.N0.length,3); // count and leading, never normalize 00
});
test('identical rows and multiline mixed evidence survive constant folding',()=>{
 const items=make().map(x=>({...x,text:'repeated long log entry zone=009 queue=000 count=00042 code=2026 status=normal\r'}));
 items[1].text+='\nshort exceptional line 999';
 const p=projectLogTemplates(items);assert.equal(p.kind,'log_templates');
 assert.deepEqual(expandLogTemplates(p),items);
});
test('regular row blocks preserve every line and exception across numeric boundaries',()=>{
 const items=[{id:'all',source:'service.log',startLine:1,endLine:200,text:Array.from({length:200},(_,i)=>`L${String(i).padStart(5,'0')} routine entry zone=${i%3} batch=${i} queue=0 trace=background-${i%7}-${i}\r`).join('\n')}];
 items[0].text=items[0].text.replace('L00038 routine','L00038 WARNING irregular');
 const p=projectLogTemplates(items);
 assert(Object.keys(p.blocks).length>0);assert(p.context.includes('WARNING irregular'));
 assert.deepEqual(expandLogTemplates(p),items);
 assert(p.context.length<items[0].text.length*.3);
});
test('block format collisions stay native and very large integers remain exact',()=>{
 const items=[{id:'all',source:'service.log',startLine:1,endLine:60,text:Array.from({length:60},(_,i)=>`routine constant long worker entry key=${9007199254740991000n+BigInt(i)} seq=${i} queue=0 status=healthy`).join('\n')}];
 const p=projectLogTemplates(items);assert(Object.keys(p.blocks).length>0);assert.deepEqual(expandLogTemplates(p),items);
 items[0].text+='\n[=B0 user-owned marker]';assert.equal(projectLogTemplates(items).kind,'original');
});
