// Diagnostic only. Accept an existing official browser handle; never connect,
// alter configuration, retry, call Jev, or expose returned private tab metadata.
import { performance } from 'node:perf_hooks';

const safeCodes=new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ECONNABORTED','EPIPE','ENOENT','EACCES','ENOTFOUND','EAI_AGAIN','ERR_CONNECTION_CLOSED','ERR_CONNECTION_REFUSED','ERR_CONNECTION_RESET','ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED','ERR_CERT_AUTHORITY_INVALID','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
// Export fixed vocabulary only. The original object goes solely to an explicit
// local-memory callback for inspection, including unknown codes and nested causes.
function errorSummary(error){
  const causes=[],seen=new Set();let current=error;
  for(let depth=0;current!=null&&depth<4&&!seen.has(current);depth++){
    seen.add(current);
    const value=key=>{
      if(typeof current!=='object'&&typeof current!=='function')return undefined;
      const d=Object.getOwnPropertyDescriptor(current,key);return d&&'value'in d?d.value:undefined;
    };
    const message=typeof current==='string'?current:value('message');
    const messageText=typeof message==='string'?message:'';
    const rawCode=value('code'),status=value('status')??value('statusCode');
    causes.push({depth,code:safeCodes.has(rawCode)?rawCode:null,hasUnexportedCode:rawCode!=null&&!safeCodes.has(rawCode),
      httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,
      failureBoundary:messageText==='nodeRepl.fetch request failed'?'node_repl_fetch':null,
      safeMessage:messageText==='nodeRepl.fetch request failed'?'nodeRepl.fetch request failed':null,
      errorClass:/timeout|timed out/i.test(messageText)?'timeout':/disconnect|closed|not connected/i.test(messageText)?'disconnected':'other'});
    current=value('cause');
  }
  return causes;
}

export async function probeChromeTabs({browser, waitMs=45000, emit=()=>{},captureError}={}) {
  if (typeof browser?.tabs?.list!=='function') throw Error('OFFICIAL_BROWSER_HANDLE_REQUIRED');
  if (!Number.isInteger(waitMs)||waitMs<1||waitMs>45000) throw Error('INVALID_PROBE_WAIT');
  if (typeof emit!=='function') throw Error('INVALID_PROBE_EMITTER');
  if (captureError!==undefined&&typeof captureError!=='function') throw Error('INVALID_ERROR_CAPTURE');
  const started=performance.now();
  let timer;
  const event=(phase,extra={})=>({phase,elapsedMs:Math.round(performance.now()-started),...extra});
  emit(event('tabs_list_started',{attempts:1,waitMs,startedAtUtc:new Date().toISOString()}));
  const operation=Promise.resolve().then(()=>browser.tabs.list()).then(
    tabs=>Array.isArray(tabs)
      ? event('tabs_list_returned',{status:'success',tabCount:tabs.length})
      : event('tabs_list_returned',{status:'unexpected_response_shape',tabCount:null}),
    error=>{
      let captured=false;
      if(captureError){try{captureError(error);captured=true;}catch{/* A local capture failure must not hide the operation error. */}}
      const causes=errorSummary(error);
      const nativeFetchFailed=causes.some(c=>c.failureBoundary==='node_repl_fetch');
      return event('tabs_list_returned',{status:'operation_error',tabCount:null,
        errorClass:causes[0]?.errorClass??'other',causes,rawErrorCapturedLocally:captured,
        ...(nativeFetchFailed?{failureBoundary:'node_repl_fetch',rootCause:'unknown',
          nextDiagnostic:'official_host_network_logs',retryWithoutChange:false}:{}),
      });
    },
  );
  try {
    const result=await Promise.race([operation,new Promise(resolve=>{
      timer=setTimeout(()=>resolve(event('probe_wait_expired',{
        status:'pending',tabCount:null,underlyingCallCancelled:false,
      })),waitMs);
    })]);
    emit(result);
    return {...result,attempts:1};
  } finally { clearTimeout(timer); }
}
