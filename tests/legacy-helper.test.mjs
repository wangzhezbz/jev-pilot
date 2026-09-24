import test from 'node:test';
import assert from 'node:assert/strict';
import{mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync}from'node:fs';
import{tmpdir}from'node:os';import{join}from'node:path';
import{migrateLegacyHelper}from'../src/legacy-helper.mjs';
const original=readFileSync(new URL('./fixtures/legacy-jev-assistant.md',import.meta.url));
function fixture(content){const home=mkdtempSync(join(tmpdir(),'jev-legacy-')),dir=join(home,'.codex/skills/jev-assistant');mkdirSync(dir,{recursive:true});const path=join(dir,'SKILL.md');if(content!==undefined)writeFileSync(path,content);return{home,dir,path};}
test('known helper migrates once, backs up exact bytes and retains fallback invocation',()=>{
 const f=fixture(original),r=migrateLegacyHelper(f);assert(r.changed);assert(readFileSync(r.backup).equals(original));
 const updated=readFileSync(f.path,'utf8');assert(updated.includes('jev_evidence'));assert(updated.includes('scripts/jev.mjs'));assert(updated.includes('.env.local'));
 assert.equal(migrateLegacyHelper(f).status,'already_compatible');assert.equal(readdirSync(f.dir).length,2);
});
test('missing or custom helper remains untouched',()=>{
 const missing=fixture();assert.equal(migrateLegacyHelper(missing).status,'not_present');
 const f=fixture('custom user skill');assert.equal(migrateLegacyHelper(f).status,'custom_skill_unchanged');assert.equal(readFileSync(f.path,'utf8'),'custom user skill');assert.equal(readdirSync(f.dir).length,1);
});
test('an existing different backup is not overwritten and prevents migration',()=>{
 const f=fixture(original);writeFileSync(f.path+'.before-jev-pilot','older custom backup');assert.equal(migrateLegacyHelper(f).status,'backup_conflict_unchanged');assert(readFileSync(f.path).equals(original));assert.equal(readFileSync(f.path+'.before-jev-pilot','utf8'),'older custom backup');
});
