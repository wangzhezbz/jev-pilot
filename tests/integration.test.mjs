import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Store, hash } from '../src/core.mjs';
import { Pilot } from '../src/pilot.mjs';
import { dashboard } from '../src/dashboard.mjs';
import { createAutomation } from '../src/automation.mjs';

test('vendored source hashes match pinned originals', () => {
  for (const source of JSON.parse(readFileSync(new URL('../vendor/sources.json', import.meta.url)))) assert.equal(hash(readFileSync(new URL('../' + source.path, import.meta.url), 'utf8')), source.sha256);
});
test('five locale dictionaries have identical keys and translated hero content', () => {
  const dictionaries = ['en','zh-CN','ru','ja','ko'].map(l => JSON.parse(readFileSync(new URL('../locales/'+l+'.json', import.meta.url))));
  for (const d of dictionaries) { assert.deepEqual(Object.keys(d), Object.keys(dictionaries[0])); assert.equal(Object.values(d).every(v => typeof v === 'string' && v.length > 0), true); }
  assert.equal(new Set(dictionaries.map(d => d.headline)).size, 5); assert.equal(dictionaries[1].headline, '当 Codex 遇到 Jev\n体验飞一般的感觉');
});
test('MCP stdio initialize, list, call, malformed request and EOF lifecycle', async () => {
  const home = mkdtempSync(join(tmpdir(), 'jev-mcp-'));
  const p = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], { env: { ...process.env, JEV_PILOT_HOME: home, TYPESAFE_API_KEY: '' }, stdio: ['pipe','pipe','pipe'] }); p.stderr.resume();
  let output = ''; p.stdout.on('data', b => output += b);
  p.stdin.end([
    JSON.stringify({ jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'} }),
    JSON.stringify({ jsonrpc:'2.0',id:2,method:'tools/list' }),
    JSON.stringify({ jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'jev_pilot',arguments:{workspace:home,operation:'metrics'}} }),
    'bad json',
  ].join('\n')+'\n');
  const exit = await new Promise(resolve => p.on('exit', resolve)); assert.equal(exit, 0);
  const messages = output.trim().split('\n').map(JSON.parse); assert.equal(messages.find(m=>m.id===1).result.serverInfo.name,'jev-pilot'); assert.equal(messages.find(m=>m.id===2).result.tools[0].name,'jev_pilot'); assert.equal(messages.find(m=>m.id===3).result.structuredContent.savings,null); assert.equal(messages.some(m=>m.error?.code===-32700),true);
});
test('dashboard binds localhost, protects API, blocks cross-origin writes and never returns key', async () => {
  const home = mkdtempSync(join(tmpdir(),'jev-dashboard-')), workspace=join(home,'project');mkdirSync(workspace);
  const pilot=new Pilot({store:new Store({home:join(home,'private')}),key:null});const running=await dashboard(workspace,{pilot});
  const url=new URL(running.url),token=url.hash.slice(1),base=url.origin;
  try {
    assert.equal((await fetch(base+'/api/status')).status,403);
    assert.equal((await fetch(base+'/api/config',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://attacker.invalid'},body:'{}'})).status,403);
    const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    assert.equal((await fetch(base+'/api/config',{method:'POST',headers,body:JSON.stringify({locale:'ja'})})).status,200);
    const key='apikey_fixture_only_1234567890';assert.equal((await fetch(base+'/api/key',{method:'POST',headers,body:JSON.stringify({key})})).status,200);
    const result=await fetch(base+'/api/status',{headers}).then(r=>r.text());assert.equal(result.includes(key),false);assert.equal(JSON.parse(result).status.config.locale,'ja');
    assert.equal((await fetch(base+'/locales/ko.json')).status,200);
  } finally { running.close(); }
});
test('automatic output filtering skips exact-output tasks, preserves structured data and saves raw text', async () => {
  const home=mkdtempSync(join(tmpdir(),'jev-auto-'));const store=new Store({home:join(home,'private')});
  const send=async payload=>({model:'fixture',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.entries(payload.questions).map(([id,q])=>{const i=+id.slice(1),choice=i===0?'keep':'exclude';return[id,{type:'choice',choice,probabilities:{keep:choice==='keep'?1:0,review:0,exclude:choice==='exclude'?1:0}}]}))});
  const auto=createAutomation({store,key:'fixture',send}),base={cwd:home,session_id:'s',turn_id:'t'};
  try {
    await auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'find the useful first entry'});
    const original=Array.from({length:300},(_,i)=>`line ${i} `+'x'.repeat(60)).join('\n');
    const filtered=await auto.hook({...base,hook_event_name:'PostToolUse',tool_name:'Bash',tool_use_id:'1',tool_response:original});
    assert.equal(filtered.continue,false);assert.match(filtered.stopReason,/Artifact:/);
    assert.equal(store.list(store.project(home),'artifact')[0].items.map(x=>x.text).join('\n'),original);
    assert.deepEqual(await auto.hook({...base,hook_event_name:'PostToolUse',tool_name:'Bash',tool_use_id:'2',tool_response:{output:original}}),{});
    await auto.hook({...base,hook_event_name:'UserPromptSubmit',prompt:'show exact output'});
    assert.deepEqual(await auto.hook({...base,hook_event_name:'PostToolUse',tool_name:'Bash',tool_use_id:'3',tool_response:original}),{});
  } finally {auto.close();}
});
