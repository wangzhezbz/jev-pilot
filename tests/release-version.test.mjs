import test from 'node:test';import assert from 'node:assert/strict';
import {assertReleaseVersion,nextReleaseVersion,releaseParts,newestReleaseVersion} from '../src/release-version.mjs';
const previousVersion='0.2.0+codex.20260926190000';
const check=v=>assertReleaseVersion({portable:v,codex:v,packageVersion:v.split('+')[0],previousVersion});
test('rejects the real regressed progress package and duplicate release',()=>{
 assert.throws(()=>check('0.2.0+codex.20260926164432'),/NOT_NEWER/);assert.throws(()=>check(previousVersion),/NOT_NEWER/);
});
test('monotonic stamp handles local clock behind the previous package',()=>{
 const next=nextReleaseVersion({base:'0.2.0',previousVersion,now:Date.parse('2026-09-26T16:44:32Z')});assert.equal(next,'0.2.0+codex.20260926190001');assert.equal(check(next),next);
});
test('base increase upgrades before timestamp ordering; base decrease is rejected',()=>{
 assert.equal(check('0.2.1+codex.20260926160000'),'0.2.1+codex.20260926160000');assert.throws(()=>check('0.1.9+codex.20270926190000'),/NOT_NEWER/);
});
test('mismatched manifests or base versions cannot ship',()=>{
 assert.throws(()=>assertReleaseVersion({portable:previousVersion,codex:'different',packageVersion:'0.2.0',previousVersion}),/MANIFEST/);
 assert.throws(()=>assertReleaseVersion({portable:previousVersion,codex:previousVersion,packageVersion:'0.2.1',previousVersion}),/PACKAGE/);
});
test('local cache overrides and invalid timestamps fail explicitly',()=>{
 for(const v of ['0.2.0+codex.local-20260927-010410','0.2.0+codex.20260230000000','0.2.0+codex.20261326190000'])assert.throws(()=>releaseParts(v));
});
test('repeated preparation uses both current manifests and the packaged floor',()=>{
 const current='0.2.1+codex.20260927100000';
 const floor=newestReleaseVersion([previousVersion,current,'0.2.1+codex.20260927090000']);
 assert.equal(floor,current);
 assert.equal(nextReleaseVersion({base:'0.2.1',previousVersion:floor,now:0}),'0.2.1+codex.20260927100001');
});
