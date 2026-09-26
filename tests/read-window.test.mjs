import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {Pilot} from '../src/pilot.mjs';
import {evidenceArguments,evidenceTool} from '../src/evidence-tool.mjs';
function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'jev-window-')),store=new Store({home:mkdtempSync(join(tmpdir(),'jev-window-state-'))});
 const pilot=new Pilot({store,key:'',send:()=>{throw Error('must not call a model');}});t.after(()=>pilot.close());
 return {root,write:(name,body)=>writeFileSync(join(root,name),body),read:input=>pilot.call({workspace:root,operation:'read',input})};
}
test('bounded exact read reconstructs Unicode and CRLF source with no lost boundary failures',async t=>{
 const f=fixture(t),body=Array.from({length:240},(_,i)=>`${i===80?'ERROR required boundary evidence':'代码 🧪'} row ${i} ${'x'.repeat(24)}`).join('\r\n');f.write('source.mjs',body);
 let r=await f.read({path:'source.mjs',maxLines:80,budget:1800}),parts=[],pages=0,sawError=false;
 const artifactId=r.artifactId;
 while(true){assert.ok(Buffer.byteLength(JSON.stringify(r))<=1800);assert.equal(r.artifactId,artifactId);parts.push(r.text);sawError ||= r.text.includes('ERROR');pages++;if(!r.nextLine)break;r=await f.read({artifactId,startLine:r.nextLine,maxLines:80,budget:1800});}
 assert.equal(parts.join(''),body);assert.ok(sawError);assert.ok(pages>2);assert.equal(r.completeFile,false);
});
test('snapshot pagination remains stable after file edit, fresh path observes new content',async t=>{
 const f=fixture(t);f.write('state.txt','old first\nold second\n');const first=await f.read({path:'state.txt',maxLines:1});
 f.write('state.txt','new first\nnew second\n');const second=await f.read({artifactId:first.artifactId,startLine:first.nextLine});assert.equal(second.text,'old second\n');
 const fresh=await f.read({path:'state.txt'});assert.notEqual(fresh.sourceHash,first.sourceHash);assert.equal(fresh.text,'new first\nnew second\n');
});
test('minified line is explicitly unread rather than silently cut or spilled',async t=>{
 const f=fixture(t);f.write('bundle.js','x'.repeat(9000));const r=await f.read({path:'bundle.js',budget:1024});
 assert.equal(r.status,'line_exceeds_budget');assert.equal(r.text,'');assert.equal(r.completeFile,false);assert.equal(r.nextLine,1);assert.ok(Buffer.byteLength(JSON.stringify(r))<=1024);
 const full=await f.read({artifactId:r.artifactId,budget:12000});assert.equal(full.text,'x'.repeat(9000));assert.equal(full.completeFile,true);
});
test('exact range does not claim complete file coverage; empty file is explicit',async t=>{
 const f=fixture(t);f.write('a.json','{\n "ok": true\n}\n');let r=await f.read({path:'a.json',startLine:2,maxLines:1});assert.equal(r.text,' "ok": true\n');assert.equal(r.nextLine,3);assert.equal(r.completeFile,false);
 f.write('empty','');r=await f.read({path:'empty'});assert.equal(r.text,'');assert.equal(r.totalLines,0);assert.equal(r.nextLine,null);assert.equal(r.completeFile,true);
});
test('read refuses private paths, escaped symlinks, binary, invalid UTF8 and oversized sources',async t=>{
 const f=fixture(t);f.write('.env.local','secret');await assert.rejects(f.read({path:'.env.local'}),/PRIVATE_PATH/);
 const external=join(mkdtempSync(join(tmpdir(),'outside-window-')),'a');writeFileSync(external,'outside');symlinkSync(external,join(f.root,'link'));await assert.rejects(f.read({path:'link'}),/OUTSIDE_WORKSPACE/);
 for(const [name,body] of [['binary',Buffer.from([0])],['encoding',Buffer.from([255])],['large','x'.repeat(1000001)]]){f.write(name,body);await assert.rejects(f.read({path:name}));}
});
test('invalid pages fail, and public tool routes reads without a separate skill call',async t=>{
 const f=fixture(t);f.write('a','one\ntwo');
 for(const input of [{path:'a',startLine:0},{path:'a',startLine:4},{path:'a',maxLines:401},{path:'a',budget:100},{artifactId:'missing'},{path:'a',artifactId:'both'}])await assert.rejects(f.read(input));
 const args=evidenceArguments({workspace:f.root,operation:'read',input:{path:'a'}});assert.equal(args.operation,'read');assert.ok(evidenceTool.inputSchema.properties.operation.enum.includes('read'));
});
