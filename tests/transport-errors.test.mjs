import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {transport} from '../src/core.mjs';
import {postTypeSafe} from '../runtime/desktop/transport.mjs';
function fake({code=0,status=200,body='{"model":"fixture"}'}={}) {
 return (command,args,options)=>{
  assert(!JSON.stringify({command,args,options}).includes('private_fixture_key'));
  const p=new EventEmitter();p.stdin=new PassThrough();p.stdout=new PassThrough();p.stderr=new PassThrough();p.kill=()=>{};
  p.stdin.on('finish',()=>setImmediate(()=>{p.stdout.write(body+'\nJEV_HTTP_STATUS:'+status);p.stderr.write('SECRET_SENTINEL');p.emit('close',code);}));return p;
 };
}
for(const [name,send] of [['shared',transport],['standalone',postTypeSafe]]){
 test(name+' transport classifies failures without exposing response or stderr',async()=>{
  for(const [code,status,expected] of [[28,0,'JEV_TIMEOUT'],[5,0,'JEV_PROXY_DNS'],[6,0,'JEV_DNS'],[7,0,'JEV_CONNECT'],[35,0,'JEV_TLS'],[60,0,'JEV_TLS'],[97,0,'JEV_PROXY'],[22,401,'JEV_AUTH'],[22,403,'JEV_AUTH'],[22,429,'JEV_RATE_LIMIT'],[22,503,'JEV_SERVER'],[22,400,'JEV_HTTP_ERROR']]){
   await assert.rejects(send({},'private_fixture_key',{spawnImpl:fake({code,status,body:'SECRET_SENTINEL'})}),{message:expected});
  }
  assert.deepEqual(await send({},'private_fixture_key',{spawnImpl:fake()}),{model:'fixture'});
  await assert.rejects(send({},'private_fixture_key',{spawnImpl:fake({body:'invalid'})}),{message:'INVALID_RESPONSE'});
 });
}
