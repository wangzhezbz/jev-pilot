import {spawn} from 'node:child_process';

export function curlOutput(raw) {
  const match=/\nJEV_HTTP_STATUS:(\d{3})$/.exec(raw);
  return {body:match?raw.slice(0,match.index):raw,httpStatus:match?Number(match[1]):null};
}
export function curlFailure(code,httpStatus) {
  if(code===22 || (httpStatus>=400 && code===0)) {
    if(httpStatus===401||httpStatus===403)return 'JEV_AUTH';
    if(httpStatus===429)return 'JEV_RATE_LIMIT';
    if(httpStatus>=500)return 'JEV_SERVER';
    return 'JEV_HTTP_ERROR';
  }
  return ({5:'JEV_PROXY_DNS',6:'JEV_DNS',7:'JEV_CONNECT',28:'JEV_TIMEOUT',35:'JEV_TLS',51:'JEV_TLS',60:'JEV_TLS',97:'JEV_PROXY'})[code]??'JEV_UNAVAILABLE';
}

// macOS curl reliably uses the configured local HTTP proxy. Secret headers and
// payload travel on stdin, never in argv, shell text, temporary files or logs.
export function postTypeSafe(payload,key,{spawnImpl=spawn}={}) {
  if(!key||/[\r\n]/.test(key))return Promise.reject(new Error('INVALID_KEY'));
  const escape=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\r','\\r').replaceAll('\n','\\n')+'"';
  const config=[
    'url = "https://api.typesafe.ai/v1/systemone"','request = "POST"',
    'silent','show-error','fail','max-time = 2','connect-timeout = 1.5',
    'write-out = "\\nJEV_HTTP_STATUS:%{http_code}"',
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
    child.on('close',code=>{const parsed=curlOutput(body);if(code!==0||parsed.httpStatus>=400)return done(new Error(curlFailure(code,parsed.httpStatus)));try{done(null,JSON.parse(parsed.body));}catch{done(new Error('INVALID_RESPONSE'));}});
    child.stdin.on('error',()=>{});child.stdin.end(config);
  });
}
