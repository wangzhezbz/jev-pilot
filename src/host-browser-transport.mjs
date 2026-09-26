// Official JS hosts do not expose process. Fetch uses the host's configured networking.
// Fixed TypeSafe endpoint, no redirects, retries, subprocess or browser-page execution.
import { fail, requireValue } from './core.mjs';
export async function hostTransport(payload, key, { timeoutMs = 5000, signal, onTiming, fetchImpl = fetch } = {}) {
  requireValue(typeof key === 'string' && key.length > 0 && !/[\r\n]/.test(key), 'MISSING_KEY');
  if (signal?.aborted) throw fail('CANCELLED');
  const effectiveTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  const start = performance.now(), timeout = AbortSignal.timeout(effectiveTimeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let status = 'success', httpStatus, phase = 'waiting_headers', headersMs = null, bodyMs = null, responseBytes = 0;
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', { method: 'POST', redirect: 'error', signal: combined,
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    headersMs = performance.now() - start; httpStatus = response.status; phase = 'reading_body';
    if (!response.ok) { await response.body?.cancel(); throw fail(httpStatus === 401 || httpStatus === 403 ? 'JEV_AUTH' : httpStatus === 429 ? 'JEV_RATE_LIMIT' : 'JEV_HTTP_ERROR'); }
    const reader = response.body.getReader(), parts = []; let bytes = 0;
    for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.byteLength; responseBytes = bytes;
      if (bytes > 2000000) { await reader.cancel(); throw fail('RESPONSE_LIMIT'); } parts.push(item.value); }
    bodyMs = performance.now() - start - headersMs; phase = 'parsing';
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw fail('INVALID_RESPONSE'); }
  } catch (e) {
    status = signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'JEV_TIMEOUT' : /^[A-Z][A-Z0-9_]+$/.test(e.code || '') ? e.code : 'JEV_UNAVAILABLE';
    throw fail(status);
  } finally { onTiming?.({ transport: 'host_fetch', status, httpStatus, phase, effectiveTimeoutMs, headersMs, bodyMs, responseBytes, totalMs: performance.now() - start }); }
}
