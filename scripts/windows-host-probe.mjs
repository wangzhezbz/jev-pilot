// Diagnostic only. Accept an existing official browser handle; never connect,
// alter configuration, retry, call Jev, or expose returned private tab metadata.
import { performance } from 'node:perf_hooks';

export async function probeChromeTabs({browser, waitMs=45000, emit=()=>{}}={}) {
  if (typeof browser?.tabs?.list!=='function') throw Error('OFFICIAL_BROWSER_HANDLE_REQUIRED');
  if (!Number.isInteger(waitMs)||waitMs<1||waitMs>45000) throw Error('INVALID_PROBE_WAIT');
  if (typeof emit!=='function') throw Error('INVALID_PROBE_EMITTER');
  const started=performance.now();
  let timer;
  const event=(phase,extra={})=>({phase,elapsedMs:Math.round(performance.now()-started),...extra});
  emit(event('tabs_list_started',{attempts:1,waitMs}));
  const operation=Promise.resolve().then(()=>browser.tabs.list()).then(
    tabs=>Array.isArray(tabs)
      ? event('tabs_list_returned',{status:'success',tabCount:tabs.length})
      : event('tabs_list_returned',{status:'unexpected_response_shape',tabCount:null}),
    error=>event('tabs_list_returned',{
      status:'operation_error',tabCount:null,
      // Do not export arbitrary error text, codes, paths, or URLs.
      errorClass:/timeout|timed out/i.test(String(error?.message??''))?'timeout':
        /disconnect|closed|not connected/i.test(String(error?.message??''))?'disconnected':'other',
    }),
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
