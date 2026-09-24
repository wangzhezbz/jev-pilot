// Diagnostic wrapper around the production transport. Never logs request config,
// credentials, response bodies, proxy addresses or stderr.
import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {transport} from '../../src/core.mjs';
export function measuredTransport(observe){
 return (payload,key,options)=>transport(payload,key,{...options,spawnImpl:(command,args,config)=>{
  const child=spawn(command,args,config),original=child.stdout,stream=new PassThrough();child.stdout=stream;
  const end=child.stdin.end.bind(child.stdin);
  child.stdin.end=(input,...rest)=>end(input.replace('JEV_HTTP_STATUS:%{http_code}','JEV_HTTP_STATUS:%{http_code}\\nJEV_TIMING:%{time_namelookup},%{time_connect},%{time_appconnect},%{time_starttransfer},%{time_total},%{http_code}'),...rest);
  let data='';original.on('data',b=>{data+=b;if(Buffer.byteLength(data)>2000000){child.kill();data='';}});
  original.on('end',()=>{
   const match=data.match(/\nJEV_TIMING:([^\n]*)/);
   if(match){const values=match[1].split(',').map(Number);if(values.length===6&&values.every(Number.isFinite))observe(Object.fromEntries(['dnsSeconds','tcpSeconds','tlsSeconds','firstByteSeconds','totalSeconds','httpCode'].map((k,i)=>[k,values[i]])));data=data.replace(match[0],'');}
   stream.end(data);
  });return child;
 }});
}
