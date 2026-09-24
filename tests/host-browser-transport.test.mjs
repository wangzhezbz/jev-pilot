import test from 'node:test';
import assert from 'node:assert/strict';
import { hostTransport } from '../src/host-browser-transport.mjs';

test('host fetch uses the fixed endpoint and does not follow redirects or retry', async () => {
  let count = 0;
  const result = await hostTransport({ state: { test: true } }, 'fixture', { fetchImpl: async (url, options) => {
    count++; assert.equal(url, 'https://api.typesafe.ai/v1/systemone'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture'); assert.ok(options.signal);
    return new Response(JSON.stringify({ usage: { input_tokens: 8, output_tokens: 1 } }));
  } });
  assert.equal(count, 1); assert.equal(result.usage.input_tokens, 8);
});
test('host HTTP failures redact response text and never retry', async () => {
  for (const [status, code] of [[401, 'JEV_AUTH'], [403, 'JEV_AUTH'], [429, 'JEV_RATE_LIMIT'], [500, 'JEV_HTTP_ERROR']]) {
    let calls = 0;
    await assert.rejects(hostTransport({}, 'fixture', { fetchImpl: async () => { calls++; return new Response('private response detail', { status }); } }), e => e.code === code && !e.message.includes('private'));
    assert.equal(calls, 1);
  }
});
test('host fetch cancellation, invalid JSON and oversized response are bounded', async () => {
  await assert.rejects(hostTransport({}, 'fixture', { signal: AbortSignal.abort(), fetchImpl: () => { throw Error('should not run'); } }), /CANCELLED/);
  await assert.rejects(hostTransport({}, 'fixture', { fetchImpl: async () => new Response('invalid') }), /INVALID_RESPONSE/);
  await assert.rejects(hostTransport({}, 'fixture', { fetchImpl: async () => new Response('x'.repeat(2000001)) }), /RESPONSE_LIMIT/);
});
test('host fetch observes its network deadline and reports timing', async () => {
  const timings = [];
  await assert.rejects(hostTransport({}, 'fixture', { timeoutMs: 10, onTiming: x => timings.push(x), fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
    const keepAlive = setTimeout(() => resolve(new Response('{}')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
  }) }), /JEV_TIMEOUT/);
  assert.equal(timings.length, 1); assert.equal(timings[0].status, 'JEV_TIMEOUT');
});
