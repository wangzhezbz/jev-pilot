// One process-local agent per proxy configuration. Never retry a paid POST.
import https from 'node:https';
const endpoint='https://api.typesafe.ai/v1/systemone';
const proxyKeys=['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy','ALL_PROXY','all_proxy','NO_PROXY','no_proxy'];
const failure=code=>Object.assign(new Error(code),{code});
export function poolSupported(env=process.env,version=process.versions.node){
  const [major,minor]=version.split('.').map(Number);
  if(major<24||(major===24&&minor<5)||env.CURL_CA_BUNDLE||env.SSL_CERT_FILE||env.SSL_CERT_DIR)return false;
  const proxy=env.https_proxy||env.HTTPS_PROXY||env.all_proxy||env.ALL_PROXY;
  if(proxy)try{if(!['http:','https:'].includes(new URL(proxy).protocol))return false;}catch{return false;}
  return true;
}
function networkCode(e){
  if(['ENOTFOUND','EAI_AGAIN'].includes(e.code))return 'JEV_DNS';
  if(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH'].includes(e.code))return 'JEV_CONNECT';
  if(/TLS|CERT|SSL/.test(e.code??''))return 'JEV_TLS';
  return 'JEV_UNAVAILABLE';
}
export function createPooledTransport({url=endpoint,request=https.request,makeAgent=options=>new https.Agent(options)}={}){
  const agents=new Map();
  function agentFor(env){
    const proxyEnv=Object.fromEntries(proxyKeys.filter(k=>env[k]).map(k=>[k,env[k]]));
    // Node's built-in proxy agent has no ALL_PROXY alias; match curl precedence.
    if(!proxyEnv.https_proxy&&!proxyEnv.HTTPS_PROXY&&(proxyEnv.all_proxy||proxyEnv.ALL_PROXY))proxyEnv.HTTPS_PROXY=proxyEnv.all_proxy||proxyEnv.ALL_PROXY;
    const id=JSON.stringify(proxyEnv);
    if(!agents.has(id)){
      // Bound idle pools when proxy settings change. Active requests finish normally.
      for(const [old,a] of agents)if(Object.values(a.sockets??{}).every(s=>!s.length)){a.destroy();agents.delete(old);}
      agents.set(id,makeAgent({keepAlive:true,maxSockets:4,maxFreeSockets:2,timeout:30000,proxyEnv}));
    }
    return agents.get(id);
  }
  const send=(payload,key,{timeoutMs=5000,signal,env=process.env,onTiming}={})=>{
    if(!key||/[\r\n]/.test(key))return Promise.reject(failure('MISSING_KEY'));
    if(signal?.aborted)return Promise.reject(failure('CANCELLED'));
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return Promise.reject(failure('JEV_TIMEOUT'));
    let body;try{body=JSON.stringify(payload);}catch{return Promise.reject(failure('INVALID_INPUT'));}
    return new Promise((resolve,reject)=>{
      const start=performance.now(),timing={transport:'node_keepalive',reusedSocket:false};
      let req,timer,settled=false,bytes=0,parts=[];
      const stamp=name=>{timing[name]=Math.round((performance.now()-start)*1000)/1000;};
      const done=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);stamp('totalMs');
        timing.status=error?.code??'success';try{onTiming?.({...timing});}catch{}
        error?reject(error):resolve(value);
      };
      const stop=code=>{const e=failure(code);done(e);req?.destroy(e);};
      const abort=()=>stop('CANCELLED');
      timer=setTimeout(()=>stop('JEV_TIMEOUT'),timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      try{
        req=request(url,{method:'POST',agent:agentFor(env),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
          stamp('firstByteMs');timing.httpStatus=res.statusCode;
          res.on('error',()=>done(failure('JEV_UNAVAILABLE')));
          res.on('aborted',()=>done(failure('JEV_UNAVAILABLE')));
          res.on('data',chunk=>{bytes+=chunk.length;if(bytes>2000000){stop('RESPONSE_LIMIT');return;}parts.push(chunk);});
          res.on('end',()=>{
            if(settled)return;
            const status=res.statusCode;
            if(status<200||status>=300)return done(failure(status===401||status===403?'JEV_AUTH':status===429?'JEV_RATE_LIMIT':status>=500?'JEV_SERVER':'JEV_HTTP_ERROR'));
            try{done(null,JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{done(failure('INVALID_RESPONSE'));}
          });
        });
        req.on('socket',socket=>{
          stamp('socketAssignedMs');
          timing.reusedSocket=req.reusedSocket===true;
          if(!timing.reusedSocket){socket.once('lookup',()=>stamp('dnsMs'));socket.once('connect',()=>stamp('tcpMs'));socket.once('secureConnect',()=>stamp('tlsMs'));}
        });
        req.on('finish',()=>stamp('requestWrittenMs'));
        req.on('error',e=>done(failure(networkCode(e))));
        if(signal?.aborted){abort();return;}
        req.end(body);
      }catch(e){done(failure(networkCode(e)));req?.destroy();}
    });
  };
  send.close=()=>{for(const a of agents.values())a.destroy();agents.clear();};
  return send;
}
export const pooledTypeSafe=createPooledTransport();
