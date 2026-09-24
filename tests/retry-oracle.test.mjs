import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {retryTask,validateRetry} from '../scripts/acceptance/retry-task.mjs';

test('held-out retry oracle rejects the buggy implementation and accepts the independent reference',async()=>{
  const root=await mkdtemp(join(tmpdir(),'jev-retry-oracle-'));
  for(const [p,v]of Object.entries(retryTask.files)){await mkdir(dirname(join(root,p)),{recursive:true});await writeFile(join(root,p),v);}
  await writeFile(join(root,'diagnosis.md'),'Independent oracle verification. '.repeat(5));
  assert.equal((await validateRetry(retryTask,root)).pass,false);
  await writeFile(join(root,'src/retry.mjs'),`export async function requestWithRetry(send,request,options={}){
    const count=options.maxAttempts===undefined?3:options.maxAttempts,base=options.baseDelayMs===undefined?100:options.baseDelayMs;
    if(!Number.isInteger(count)||count<1||count>5||!Number.isFinite(base)||base<0)throw Error('invalid options');
    const header=(o,k)=>Object.entries(o||{}).find(([n])=>n.toLowerCase()===k)?.[1];
    const safe=['GET','HEAD'].includes(String(request.method).toUpperCase())||String(header(request.headers,'idempotency-key')??'').trim().length>0;
    for(let n=0;n<count;n++){const response=await send(request);if(!safe||![429,503].includes(response.status)||n===count-1)return response;
      const raw=header(response.headers,'retry-after');let delay=base*2**n;
      if(typeof raw==='string'&&/^\\d+$/.test(raw))delay=Number(raw)*1000;
      else if(typeof raw==='string'&&Number.isFinite(Date.parse(raw)))delay=Date.parse(raw)-(options.now??Date.now)();
      await (options.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(Math.min(2000,Math.max(0,delay)));
    }
  }`);
  const result=await validateRetry(retryTask,root);assert.equal(result.pass,true,JSON.stringify(result));
});
