import test from 'node:test';
import assert from 'node:assert/strict';
import {projectEvidence,expandEvidenceProjection} from '../src/evidence-projection.mjs';
const shared='Exact shared prose '+('detail '.repeat(60));
const make=(source='note.md')=>Array.from({length:8},(_,i)=>({id:'p'+i,source,startLine:20+i*3,endLine:22+i*3,text:`Unique fact ${i}\n${shared}\n${i===7?'ERROR independent occurrence':'context'}`,sourceHash:'fixture'}));
test('shared prose projection is exactly reversible including source positions, duplicates and failures',()=>{
 const items=make(),before=JSON.stringify(items),r=projectEvidence(items);
 assert.equal(r.kind,'shared_lines');assert(r.displayBytes<r.rawBytes*.6);assert.equal(JSON.stringify(items),before);assert.deepEqual(expandEvidenceProjection(r),items);
 assert(r.context.includes('ERROR independent occurrence'));assert.equal((r.context.match(/\[=S0\]/g)||[]).length,9);
});
test('code, structured sources, unique short text and marker collisions stay verbatim',()=>{
 for(const source of ['module.mjs','data.json','data.csv']){const items=make(source),r=projectEvidence(items);assert.equal(r.kind,'original');assert.deepEqual(expandEvidenceProjection(r),items);}
 const collision=make();collision[0].text+='\n[=S0]';const r=projectEvidence(collision);assert.equal(r.kind,'original');assert.deepEqual(expandEvidenceProjection(r),collision);
 assert.equal(projectEvidence([{id:'a',text:'short',source:'a.md'}]).kind,'original');
});
test('inline prose dictionary preserves arbitrary whitespace, occurrences and contradictory records',()=>{
 const phrase='The external processor has not confirmed settlement and an authorization must not be treated as a completed payment.';
 const items=Array.from({length:60},(_,i)=>({id:String(i),source:'requests.md',startLine:i+1,endLine:i+1,text:`Record ${i}. ${phrase}\t  ${i===17?'Correction: settlement was later confirmed.':'No later update.'}\r`,sourceHash:'original'}));
 const p=projectEvidence(items,{fragments:true});assert.equal(p.kind,'shared_fragments');assert.deepEqual(expandEvidenceProjection(p),items);assert(p.context.includes('Correction: settlement was later confirmed.'));
 const collision=items.map((x,i)=>({...x,text:x.text+(i===0?'[=S1]':'')}));assert.equal(projectEvidence(collision,{fragments:true}).kind,'original');
});
test('whole repeated paragraphs replace overlapping sentence dictionaries without unused entries',()=>{
 const a='This record preserves the identity and the source relationship exactly as originally recorded.';
 const b='The request remains unresolved and has never been executed by the downstream service.';
 const items=Array.from({length:40},(_,i)=>({id:'s'+i,source:'records.md',startLine:i*3+1,endLine:i*3+3,text:`## CASE-${i}\n${a} ${b}\n`}));
 const r=projectEvidence(items,{fragments:true});assert.equal(r.kind,'shared_fragments');
 assert.deepEqual(expandEvidenceProjection(r),items);assert(Object.values(r.dictionary).includes(a+' '+b));
 for(const id of Object.keys(r.dictionary))assert(r.projected.some(x=>x.text.includes(`[=${id}]`)));
 assert(r.displayBytes<r.rawBytes*.4);
});
