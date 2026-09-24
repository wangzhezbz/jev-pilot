import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/core.mjs';
import {Pilot} from '../src/pilot.mjs';
import {modelResult} from '../src/model-result.mjs';
function fixture(t,{fail=false,reviewNoise=false}={}){
  const root=mkdtempSync(join(tmpdir(),'jev-investigate-')),home=mkdtempSync(join(tmpdir(),'jev-investigate-state-'));
  const store=new Store({home});let calls=0;const profiles=[];
  const pilot=new Pilot({store,key:'fixture',send:async p=>{calls++;profiles.push(Object.hasOwn(p.state,'items')?'shared':'isolated');if(fail)throw Error('offline');return{model:'fixture',answers:Object.fromEntries(Object.keys(p.questions).map(id=>{const candidate=p.state.items?.[Number(id.slice(1))]??JSON.parse(p.questions[id].instructions.split('\n').at(-1));const keep=candidate.text.includes('NECESSARY');return[id,{type:'choice',choice:keep?'keep':reviewNoise?'review':'exclude',probabilities:{keep:keep?1:0,review:!keep&&reviewNoise?1:0,exclude:!keep&&!reviewNoise?1:0}}];}))};}});
  t.after(()=>pilot.close());
  const call=(operation,input)=>pilot.call({workspace:root,operation,input});
  return{root,store,call,calls:()=>calls,profiles:()=>profiles,write:(p,v)=>writeFileSync(join(root,p),v),run:input=>call('investigate',{goal:'Locate the necessary quota behavior',queries:['quota'],...input})};
}
test('one investigation merges multi-query overlapping windows and preserves exact source lines without Jev',async t=>{
  const f=fixture(t),body=['preamble','before','Quota boundary','retry detail','after','footer'].join('\n');f.write('client.mjs',body);
  const r=await f.run({queries:['QUOTA','retry'],contextLines:1});
  assert.equal(r.search.matchedLines,2);assert.equal(r.items.length,1);assert.equal(r.items[0].startLine,2);assert.equal(r.items[0].endLine,5);
  assert.equal(r.items[0].text,body.split('\n').slice(1,5).join('\n'));assert.equal(f.calls(),0);
  assert.equal(r.selection.reason,'small_candidate_set');assert.match(r.context,/not exhaustive/);
  const wire=modelResult('investigate',r,{compactEvidence:true});assert(!Object.hasOwn(wire.items[0],'text'));assert(wire.context.includes(r.items[0].text));
});
test('recall uses immutable retrieved windows after source changes, never reruns a command',async t=>{
  const f=fixture(t);f.write('note.md','quota original');const r=await f.run({});f.write('note.md','quota changed');
  const old=await f.call('recall_output',{artifactId:r.artifactId});assert.equal(old.items[0].text,'quota original');
  const fresh=await f.run({});assert.notEqual(fresh.items[0].sourceHash,r.items[0].sourceHash);assert.equal(fresh.items[0].text,'quota changed');
});
test('read-only investigation refuses explicit private/outside paths and reports skipped private matches',async t=>{
  const f=fixture(t),outside=mkdtempSync(join(tmpdir(),'jev-investigate-outside-'));writeFileSync(join(outside,'note.md'),'quota private');
  f.write('.env.local','quota private');f.write('credentials.txt','quota private');f.write('note.md','quota public');
  await assert.rejects(f.run({paths:['.env.local']}),{code:'PRIVATE_PATH'});await assert.rejects(f.run({paths:[outside]}),{code:'OUTSIDE_WORKSPACE'});
  const r=await f.run({});assert.equal(r.search.skippedFileCount,1);assert(!r.context.includes('private'));assert.equal(f.calls(),0);
});
test('symlink escaping workspace is refused without model requests',async t=>{
  const f=fixture(t),outside=mkdtempSync(join(tmpdir(),'jev-investigate-link-'));
  writeFileSync(join(outside,'note.md'),'quota private');
  try{symlinkSync(outside,join(f.root,'link'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM')return t.skip('Host does not permit test symlinks');throw e;}
  await assert.rejects(f.run({paths:['link']}),{code:'OUTSIDE_WORKSPACE'});assert.equal(f.calls(),0);
});
test('matching and display limits are explicit; budget-deferred windows remain recoverable',async t=>{
  const f=fixture(t);f.write('note.md',Array.from({length:10},(_,i)=>'quota '+i+' '+('x'.repeat(200))).join('\n'));
  const r=await f.run({contextLines:0,maxMatches:2,budget:128});assert.equal(r.search.limited,true);assert.equal(r.coverage.deferred,1);assert.equal(r.completeCoverage,false);
  const saved=await f.call('recall_output',{artifactId:r.artifactId});assert.equal(saved.items.length,1);assert(saved.items[0].text.includes('quota 1'));assert(!saved.items[0].text.includes('quota 2'));
  assert.match(r.context,/limits reached/);assert.equal(f.calls(),0);
});
test('large-file and binary skips cannot be confused with complete workspace coverage',async t=>{
  const f=fixture(t);f.write('large.txt','quota '+('x'.repeat(1000001)));f.write('binary.dat',Buffer.from('quota\0value'));f.write('note.md','quota normal');
  const r=await f.run({});assert.equal(r.search.skippedFileCount,2);assert.equal(r.search.limited,true);assert.equal(r.items.length,1);assert.equal(f.calls(),0);
});
function many(f){for(let i=0;i<12;i++)f.write(`item-${String(i).padStart(2,'0')}.md`,'quota '+i+' '+(i===0?'NECESSARY ':'unrelated ')+('description '.repeat(160)));}
test('large ambiguous candidate set is filtered once, with exact recovery and reusable judgment cache',async t=>{
  const f=fixture(t);many(f);const r=await f.run({budget:4000});assert.equal(r.selection.method,'jev');assert.equal(f.calls(),1);assert.equal(r.items.length,1);assert(r.context.includes('NECESSARY'));
  const raw=await f.call('recall_output',{artifactId:r.artifactId});assert.equal(raw.items.length,12);assert(raw.items.every(x=>x.sourceHash));
  await f.run({budget:4000});assert.equal(f.calls(),1);
  assert.deepEqual(f.profiles(),['isolated']);
  await f.call('select',{goal:'Keep necessary evidence',items:[{id:'a',text:'NECESSARY'}]});assert.deepEqual(f.profiles(),['isolated','shared']);
});
test('local control and fit-in-budget cases make zero semantic requests',async t=>{
  const f=fixture(t);many(f);const all=await f.run({budget:100000});assert.equal(all.items.length,12);assert.equal(all.selection.reason,'fits_context_budget');
  const local=await f.run({selection:'local',budget:4000});assert(local.deferredIds.length>0);assert.equal(local.selection.reason,'local_requested');assert.equal(f.calls(),0);
  const exact=await f.run({exact:true,budget:4000});assert.equal(exact.selection.reason,'exact_requested');assert.equal(f.calls(),0);
});
test('judgment failure returns recoverable local evidence and flags degradation',async t=>{
  const f=fixture(t,{fail:true});many(f);const r=await f.run({budget:4000});assert.equal(r.selection.method,'local');assert.equal(r.degraded,true);assert.equal(f.calls(),1);
  assert.equal((await f.call('recall_output',{artifactId:r.artifactId})).items.length,12);
});
test('protected failure evidence survives an undersized display budget',async t=>{
  const f=fixture(t);f.write('a.log','quota ordinary '+('x'.repeat(200)));f.write('b.log','quota ERROR critical evidence '+('x'.repeat(200)));
  const r=await f.run({budget:128});assert.equal(r.items.length,1);assert(r.context.includes('critical evidence'));assert.equal(r.protectedOverflow,true);assert.equal(f.calls(),0);
});
test('uncertain windows cannot consume the budget and hide known relevant evidence after classification',async t=>{
 const f=fixture(t,{reviewNoise:true});many(f);const r=await f.run({budget:4000});
 assert.equal(r.selection.method,'jev');assert.equal(r.items.length,12);assert(r.items.some(x=>x.text.includes('NECESSARY')));assert.deepEqual(r.deferredIds,[]);assert.equal(r.protectedOverflow,true);assert(r.usedBytes>r.budget);
});
test('repeated prose fits without deferred evidence or paid filtering, while originals remain exact',async t=>{
 const f=fixture(t),shared='Common quota background '+('context '.repeat(200));
 for(let i=0;i<10;i++)f.write(`note-${i}.md`,`Unique observation ${i}\n${shared}\nSource detail ${i}`);
 const r=await f.run({budget:5000});assert.equal(r.items.length,10);assert.equal(r.deferredIds.length,0);assert.equal(r.selection.reason,'lossless_projection_fits');assert.equal(r.projection.lossless,true);assert.equal(f.calls(),0);
 assert.equal((await f.call('recall_output',{artifactId:r.artifactId})).items[9].text,`Unique observation 9\n${shared}\nSource detail 9`);
 const exact=await f.run({budget:5000,exact:true});assert.equal(exact.projection,undefined);assert(!exact.context.includes('[=S0]'));assert(exact.deferredIds.length>0);assert(exact.usedBytes<=5000);
});
