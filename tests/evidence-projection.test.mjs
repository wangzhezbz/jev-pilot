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
