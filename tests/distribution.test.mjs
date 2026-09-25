import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync}from'node:fs';import{join,dirname}from'node:path';import{tmpdir}from'node:os';import{stagePlugin}from'../src/distribution.mjs';
function fixture(){const base=mkdtempSync(join(tmpdir(),'jev-dist-test-')),source=join(base,'repo');for(const name of ['.codex-plugin/plugin.json','.mcp.json','src/server.mjs','skills/jev-pilot/SKILL.md','dist/native-home/auth.json','src/.env.local','runtime/desktop/install.json']){const p=join(source,name);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,name.includes('auth')||name.includes('.env')?'private sentinel':'fixture');}return{base,source};}
test('distribution excludes experiment/credential/runtime state, and refuses nested destination',()=>{const f=fixture();assert.throws(()=>stagePlugin({...f,destination:join(f.source,'dist/output')}),/STAGING_INSIDE_SOURCE/);const r=stagePlugin({...f,destination:join(f.base,'release')});assert.equal(r.files,4);assert.equal(readFileSync(join(r.destination,'src/server.mjs'),'utf8'),'fixture');assert.ok(r.manifest.every(x=>!x.path.includes('dist')&&!x.path.includes('.env')));assert.throws(()=>stagePlugin({...f,destination:r.destination}),/STAGING_DESTINATION_EXISTS/);});
test('distribution refuses symlink escapes instead of following them',()=>{const f=fixture();symlinkSync(join(f.source,'dist/native-home/auth.json'),join(f.source,'src/escape.mjs'));assert.throws(()=>stagePlugin({...f,destination:join(f.base,'release')}),/DISTRIBUTION_SYMLINK/);});
test('runtime distribution omits historical reports but keeps docs and originals; archive mode includes them',()=>{
 const f=fixture();for(const [name,value] of [['docs/usage.md','usage'],['docs/reports/evidence.json','historical evidence'],['LICENSE','license']]){mkdirSync(dirname(join(f.source,name)),{recursive:true});writeFileSync(join(f.source,name),value);}
 const slim=stagePlugin({...f,destination:join(f.base,'slim')});
 assert(!slim.manifest.some(x=>x.path.split('\\').join('/').startsWith('docs/reports/')));
 assert.equal(readFileSync(join(slim.destination,'docs/usage.md'),'utf8'),'usage');
 assert.equal(readFileSync(join(slim.destination,'LICENSE'),'utf8'),'license');
 assert.equal(readFileSync(join(f.source,'docs/reports/evidence.json'),'utf8'),'historical evidence');
 const archive=stagePlugin({...f,destination:join(f.base,'archive'),includeReports:true});
 assert.equal(readFileSync(join(archive.destination,'docs/reports/evidence.json'),'utf8'),'historical evidence');
});
