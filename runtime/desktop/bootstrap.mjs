// Dock-launched GUI apps do not inherit interactive shell proxy variables.
import {execFileSync,spawn} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function proxyEnvironment(input, systemProxyText) {
  const env={...input},added=[];
  const fields=Object.fromEntries([...systemProxyText.matchAll(/^\s*(HTTPSEnable|HTTPSProxy|HTTPSPort|HTTPEnable|HTTPProxy|HTTPPort)\s*:\s*(\S+)\s*$/gm)].map(m=>[m[1],m[2]]));
  for(const [prefix,upper,lower] of [['HTTPS','HTTPS_PROXY','https_proxy'],['HTTP','HTTP_PROXY','http_proxy']]) {
    if(env[upper]||env[lower]||fields[prefix+'Enable']!=='1')continue;
    const host=fields[prefix+'Proxy'],port=Number(fields[prefix+'Port']);
    if(!/^[A-Za-z0-9.-]+$/.test(host??'')||!Number.isInteger(port)||port<1||port>65535)continue;
    env[upper]=`http://${host}:${port}`;added.push(upper);
  }
  if(added.length&&!env.NO_PROXY&&!env.no_proxy){env.NO_PROXY='localhost,127.0.0.1,::1';added.push('NO_PROXY');}
  if(added.length)env.JEV_PROXY_ADDED=JSON.stringify(added);
  env.JEV_NETWORK_MODE=added.length?'system_proxy':(env.HTTPS_PROXY||env.https_proxy?'environment_proxy':'direct');
  return env;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  let system='';try{system=execFileSync('/usr/sbin/scutil',['--proxy'],{encoding:'utf8',timeout:1500});}catch{}
  const env=proxyEnvironment(process.env,system);
  // Reuse the same PID so the desktop remains the direct parent of the adapter.
  const args=['--use-env-proxy',join(dirname(fileURLToPath(import.meta.url)),'bridge.mjs'),...process.argv.slice(2)];
  if(process.platform!=='win32')process.execve(process.execPath,[process.execPath,...args],env);
  else {const child=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true});child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>process.exit(code??1));for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>child.kill(signal));}
}
