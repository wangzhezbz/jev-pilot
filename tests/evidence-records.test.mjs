import test from 'node:test';
import assert from 'node:assert/strict';
import {chunks} from '../src/evidence.mjs';
import {protectedEvidence} from '../src/policy.mjs';
const split=text=>chunks({text,path:'archive.md',hash:'fixture'});
test('markdown records remain whole, preserve positions and distinguish keyword protection',()=>{
 const source='# Archive\r\nContext\r\n'+Array.from({length:5},(_,i)=>`## R${i}\r\n${i===2?'pending investigation':'closed unrelated notice'}\r\n### Details\r\n${'more\r\n'.repeat(40)}`).join('');
 const r=split(source);assert.equal(r.length,6);assert(r[0].pin);
 assert.equal(r.map(x=>x.text).join('\n'),source);
 for(const item of r)assert.equal(item.text,source.split('\n').slice(item.startLine-1,item.endLine).join('\n'));
 assert.equal(r.filter(protectedEvidence).length,2);assert(r[3].text.includes('pending investigation'));
});
test('fenced headings never become record boundaries; malformed fences use conservative chunks',()=>{
 const source=Array.from({length:4},(_,i)=>`## Actual ${i}\n\`\`\`md\n## not a record\n\`\`\`\n`).join('');
 const r=split(source);assert.equal(r.length,4);assert(r.every(x=>x.text.includes('## not a record')));
 const broken='```\n'+source;assert.equal(split(broken).map(x=>x.text).join('\n'),broken);
});
test('plain logs keep conservative chunking and large records are never silently truncated',()=>{
 const text=Array.from({length:92},(_,i)=>'line '+i).join('\n');const r=split(text);assert.equal(r.length,4);assert.equal(r.map(x=>x.text).join('\n'),text);
});
test('timestamped logs group whole events at bounded granularity and retain multiline failures',()=>{
 const lines=Array.from({length:600},(_,i)=>`2026-09-24T12:00:00Z event ${i}${i===127?' failed\n  traceback details\n  original cause':''}`);
 const source=lines.join('\n');const r=split(source);
 assert.equal(r.length,120);assert.equal(r.map(x=>x.text).join('\n'),source);
 assert(r.find(protectedEvidence).text.includes('original cause'));
 assert(r.every(x=>x.text.split('\n').length<10));
});
