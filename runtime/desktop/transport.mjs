import {spawn} from 'node:child_process';

// macOS curl reliably uses the configured local HTTP proxy. Secret headers and
// payload travel on stdin, never in argv, shell text, temporary files or logs.
export function postTypeSafe(payload,key,{spawnImpl=spawn}={}) {
  if(!key||/[\r\n]/.test(key))return Promise.reject(new Error('INVALID_KEY'));
  const escape=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\r','\\r').replaceAll('\n','\\n')+'"';
  const config=[
    'url = "https://api.typesafe.ai/v1/systemone"','request = "POST"',
    'silent','show-error','fail','max-time = 2','connect-timeout = 1.5',
    'header = '+escape('Authorization: Bearer '+key),
    'header = "Content-Type: application/json"',
    'data = '+escape(JSON.stringify(payload)),
  ].join('\n')+'\n';
  return new Promise((resolve,reject)=>{
    const env={...process.env};delete env.TYPESAFE_API_KEY;
    const child=spawnImpl(process.platform==='win32'?'curl.exe':'curl',['-q','--config','-'],{env,stdio:['pipe','pipe','pipe']});
    let body='',settled=false;
    const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{child.kill('SIGTERM');done(new Error('CURL_TIMEOUT'));},2500);
    child.stdout.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>1_000_000){child.kill('SIGTERM');done(new Error('RESPONSE_LIMIT'));}});
    child.stderr.resume();
    child.on('error',()=>done(new Error('CURL_UNAVAILABLE')));
    child.on('close',code=>{if(code!==0)return done(new Error('CURL_REQUEST_FAILED'));try{done(null,JSON.parse(body));}catch{done(new Error('INVALID_RESPONSE'));}});
    child.stdin.on('error',()=>{});child.stdin.end(config);
  });
}
