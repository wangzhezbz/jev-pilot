import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputerUseDriver } from '../src/host-browser-drivers.mjs';

function fixture() {
  const window = { id: 42, app: 'calculator.exe', title: 'Calculator' }, calls = [];
  let state = { window: { ...window }, accessibility: { tree: '0 window Calculator\n  7 button Seven\n  8 button Delete\n  9 button (disabled) Hidden' }, screenshots: [] };
  const sky = { target: 'windows', get_window_state: async x => { calls.push(['read',x]); return state; }, click: async x => { calls.push(['click',x]); } };
  const options = { sky, window, scope: raw=>raw, policy: { allowNames: ['Seven','Delete','Hidden'] } };
  return {options,calls,set:next=>{state=next;},get:()=>state};
}
test('Windows binds exact window and requests geometry with fresh AX', async()=>{
  const f=fixture(), d=createComputerUseDriver(f.options);
  f.options.window.id=99;f.options.window.app='other.exe';
  const o=await d.observe();assert.deepEqual(o.candidates.map(c=>c.text),['Seven','Delete']);
  await d.execute(o.candidates[0]);
  assert.deepEqual(f.calls,[['read',{window:{id:42,app:'calculator.exe'},include_screenshot:true,include_text:true}],['click',{window:{id:42,app:'calculator.exe'},element_index:7}]]);
  await assert.rejects(d.execute(o.candidates[0]),/HOST_FRESH_ALLOWED_ACTION_REQUIRED/);
});
test('changed window or missing tree discards previous action candidates',async()=>{
  for(const mutate of [s=>({...s,window:{...s.window,id:43}}),s=>({...s,window:{...s.window,app:'other.exe'}}),s=>({...s,accessibility:null}),s=>({...s,accessibility:{document_text:'7 button Seven'}})]){
    const f=fixture(),d=createComputerUseDriver(f.options),o=await d.observe();f.set(mutate(f.get()));
    await assert.rejects(d.observe());await assert.rejects(d.execute(o.candidates[0]));
    assert(!f.calls.some(c=>c[0]==='click'));
  }
});
test('consequential and invented Windows actions cannot execute',async()=>{
  const f=fixture(),d=createComputerUseDriver(f.options);
  let o=await d.observe();await assert.rejects(d.execute(o.candidates[1]),/HOST_FRESH_ALLOWED_ACTION_REQUIRED/);
  o=await d.observe();await assert.rejects(d.execute({...o.candidates[0],target:999}),/HOST_FRESH_ALLOWED_ACTION_REQUIRED/);
  assert(!f.calls.some(c=>c[0]==='click'));
});
test('driver requires an explicit window, Windows host and original scope evidence',async()=>{
  const f=fixture();
  for(const opts of [{...f.options,app:'ambiguous'},{...f.options,window:{id:42}},{...f.options,scope:undefined},{...f.options,sky:{...f.options.sky,target:'linux'}}])assert.throws(()=>createComputerUseDriver(opts));
  await assert.rejects(createComputerUseDriver({...f.options,scope:()=> 'fabricated'}).observe(),/INVALID_HOST_SCOPE/);
});
test('actual Windows AX metadata resolves literal control labels',async()=>{
  const f=fixture();f.set({...f.get(),accessibility:{tree:'0 窗口 计算器\n  9 按钮 7 ID: 137\n  27 按钮 乘 ID: 92'}});
  const d=createComputerUseDriver({...f.options,policy:{allowNames:['7','乘']}});
  const o=await d.observe();assert.deepEqual(o.candidates.map(c=>c.text),['7','乘']);await d.execute(o.candidates[0]);
  assert.equal(f.calls.at(-1)[1].element_index,9);
});
test('explicit calculator keys use current candidate names, never retry an uncertain click',async()=>{
  const f=fixture(),pressed=[];f.options.window.app='win32calc.exe';
  f.set({...f.get(),window:{id:42,app:'win32calc.exe'},accessibility:{tree:'0 窗口 计算器\n  9 按钮 7 ID: 137\n  27 按钮 乘 ID: 92'}});
  f.options.sky.press_key=async x=>pressed.push(x);
  const bindings={'7':'7','乘':'asterisk'},d=createComputerUseDriver({...f.options,policy:{allowNames:['7','乘']},calculatorKeys:bindings});bindings['7']='Return';
  const o=await d.observe();await d.execute(o.candidates[0]);
  assert.equal(f.calls[0][1].include_screenshot,false);assert.deepEqual(pressed,[{window:{id:42,app:'win32calc.exe'},key:'7'}]);assert(!f.calls.some(c=>c[0]==='click'));
  await assert.rejects(d.execute(o.candidates[1]),/HOST_FRESH_ALLOWED_ACTION_REQUIRED/);
});
test('key bindings cannot target arbitrary apps or system shortcuts',()=>{
  const f=fixture();f.options.sky.press_key=async()=>{};
  assert.throws(()=>createComputerUseDriver({...f.options,calculatorKeys:{Seven:'7'}}),/HOST_CALCULATOR_KEYS_UNSUPPORTED/);
  f.options.window.app='win32calc.exe';
  for(const calculatorKeys of [{Seven:'Control_L+r'},{Seven:'7+Return'},{Seven:'KP_Add+Return'},{Seven:'KP_Delete'},{Unapproved:'7'},{}])assert.throws(()=>createComputerUseDriver({...f.options,calculatorKeys}),/INVALID_HOST_KEY_BINDINGS/);
});

test('explicit keypad operators survive unchanged and retain fresh-action protection',async()=>{
 for(const key of ['KP_Multiply','KP_Add']){
  const f=fixture(),pressed=[];f.options.window.app='win32calc.exe';
  f.set({...f.get(),window:{id:42,app:'win32calc.exe'},accessibility:{tree:'0 窗口 计算器\n  27 按钮 运算 ID: 92'}});
  f.options.sky.press_key=async x=>pressed.push(x);
  const d=createComputerUseDriver({...f.options,policy:{allowNames:['运算']},calculatorKeys:{'运算':key}});
  const o=await d.observe();await d.execute(o.candidates[0]);
  assert.deepEqual(pressed,[{window:{id:42,app:'win32calc.exe'},key}]);
  await assert.rejects(d.execute(o.candidates[0]),/HOST_FRESH_ALLOWED_ACTION_REQUIRED/);
  assert.equal(d.progressRecheck,'calculator_keys');assert(!f.calls.some(c=>c[0]==='click'));
 }
});

test('only explicit calculator keys retain bounded full-window progress evidence',async()=>{
 const f=fixture();f.options.window.app='win32calc.exe';f.options.sky.press_key=async()=>{};
 f.set({...f.get(),window:{id:42,app:'win32calc.exe'},accessibility:{tree:'0 窗口 计算器\n表达式 7 +\n  9 按钮 7 ID: 137'}});
 const d=createComputerUseDriver({...f.options,scope:raw=>raw.split('\n').at(-1),policy:{allowNames:['7']},calculatorKeys:{'7':'7'}});
 const o=await d.observe();assert.equal(d.progressRecheck,'calculator_keys');assert.match(o.progressSource.rawSnapshot,/表达式 7 \+/);assert(!o.snapshot.includes('表达式'));assert.ok(o.progressSource.rawChars>o.progressSource.scopedChars);
 const normal=createComputerUseDriver({...f.options,policy:{allowNames:['7']}});assert.equal(normal.progressRecheck,null);assert.equal((await normal.observe()).progressSource,undefined);
});
