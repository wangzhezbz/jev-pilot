import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { runBridge } from '../runtime/desktop/bridge.mjs';
import { proxyEnvironment } from '../runtime/desktop/bootstrap.mjs';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
test('bootstrap invoked through a directory symlink really starts its child', {skip:process.platform==='win32'}, () => {
  const root=mkdtempSync(join(tmpdir(),'jev-bootstrap-link-')), real=join(root,'real'), alias=join(root,'alias');
  mkdirSync(real);symlinkSync(real,alias,'dir');
  copyFileSync(new URL('../runtime/desktop/bootstrap.mjs',import.meta.url),join(real,'bootstrap.mjs'));
  writeFileSync(join(real,'bridge.mjs'),'console.log(JSON.stringify({started:true,args:process.argv.slice(2)}))');
  const result=execFileSync(process.execPath,[join(alias,'bootstrap.mjs'),'fixture'],{encoding:'utf8',timeout:5000});
  assert.deepEqual(JSON.parse(result),{started:true,args:['fixture']});
});
test('backend retains adopted system proxy but not TypeSafe credentials or override', async () => {
  const env = proxyEnvironment({...process.env, TYPESAFE_API_KEY:'fixture-only', CODEX_CLI_PATH:'fixture-override'},
    'HTTPSEnable : 1\nHTTPSProxy : 127.0.0.1\nHTTPSPort : 10809\n');
  // Use deterministic proxy values even when the test runner already has a proxy.
  env.HTTPS_PROXY='http://127.0.0.1:10809';
  env.JEV_PROXY_ADDED='["HTTPS_PROXY"]';
  const input=new PassThrough(), output=new PassThrough(); let raw='';
  output.on('data',c=>raw+=c);
  const bridge=await runBridge({realBin:process.execPath,
    args:['-e', 'console.log(JSON.stringify({proxy:process.env.HTTPS_PROXY,key:!!process.env.TYPESAFE_API_KEY,override:!!process.env.CODEX_CLI_PATH,marker:!!process.env.JEV_PROXY_ADDED}))', '--'],
    env,input,output,judge:async()=>{throw new Error('No model call expected');}});
  try {
    await once(bridge.child,'close');
    assert.deepEqual(JSON.parse(raw),{proxy:'http://127.0.0.1:10809',key:false,override:false,marker:false});
  } finally {input.end();await bridge.cleanup();}
});
