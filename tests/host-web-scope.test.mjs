import test from 'node:test';import assert from 'node:assert/strict';
import {createWebScope,createComputerUseDriver} from '../src/host-browser-drivers.mjs';
const root='\t\t5 HTML内容 Description: Lab, URL: 127.0.0.1:8876/task';
const before='Window: Lab\n0 window Lab\n\t1 group\n';
const after='\t18 toolbar\n\t\t19 button Private account\nThe focused UI element is 5 HTML内容 Description: Lab, URL: 127.0.0.1:8876/task';
const scope=createWebScope({title:'Lab',url:'127.0.0.1:8876/task'});
test('web scope preserves merged English or separate localized final text and excludes chrome',()=>{
 for(const body of ['\t\t\t6 text Verified result footer','\t\t\t6 文本 Verified result\n\t\t\t7 文本 footer']){
  const raw=before+root+'\n'+body+'\n'+after,got=scope(raw);
  assert.equal(got,root+'\n'+body);assert(raw.includes(got));assert(!got.includes('Private account'));
 }
});
test('web scope rejects wrong or ambiguous identity instead of widening the view',()=>{
 const raw=before+root+'\n\t\t\t6 button Next\n'+after;
 for(const bad of [raw.replace('URL: 127.0.0.1:8876/task','URL: evil.example/task'),raw.replace('Description: Lab','Description: Other'),raw+'\n'+root,raw.replace('HTML内容','unknownRole')])assert.throws(()=>scope(bad));
 for(const identity of [{title:'',url:'x'},{title:'Lab',url:''},{title:'Lab\n',url:'x'}])assert.throws(()=>createWebScope(identity));
});
test('CRLF and space-indented AX roots retain literal bytes and current target IDs',async()=>{
 const raw='Browser tab: 1\r\n  20 AXWebArea Lab, URL: example.org/task\r\n    33 button Read\r\n    34 text Final result\r\n  40 toolbar\r\n';
 const local=createWebScope({title:'Lab',url:'example.org/task'}),got=local(raw);
 assert(raw.includes(got));assert(got.includes('33 button Read'));assert(!got.includes('40 toolbar'));
 let clicked;const driver=createComputerUseDriver({app:'test',sky:{get_app_state:async()=>({text:raw}),click:async x=>clicked=x.element_index},policy:{allowNames:['Read']},scope:local});
 const state=await driver.observe();assert.equal(state.candidates[0].target,33);await driver.execute(state.candidates[0]);assert.equal(clicked,33);
});
