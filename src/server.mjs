#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Pilot, operations } from './pilot.mjs';
import { VERSION } from './core.mjs';
const pilot = new Pilot(), pending = new Map();
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
const tool = { name: 'jev_pilot', description: 'JevPilot bounded task assistance: classify, filter, recover, inspect evidence, coordinate browser actions, memory, compaction, code review, checkpoints, exact extraction and metrics. Use normal Codex tools for execution. Read the bundled skill operation reference.', inputSchema: { type: 'object', properties: { workspace: { type: 'string', description: 'Absolute project directory.' }, operation: { type: 'string', enum: Object.keys(operations) }, input: { type: 'object', additionalProperties: true } }, required: ['workspace', 'operation'], additionalProperties: false } };
async function handle(msg) {
  if (msg.method === 'notifications/cancelled') { pending.get(msg.params?.requestId)?.abort(); return; }
  if (!Object.hasOwn(msg, 'id')) return;
  const controller = new AbortController(); pending.set(msg.id, controller);
  try {
    let result;
    if (msg.method === 'initialize') result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'jev-pilot', version: VERSION } };
    else if (msg.method === 'ping') result = {};
    else if (msg.method === 'tools/list') result = { tools: [tool] };
    else if (msg.method === 'tools/call') {
      if (msg.params?.name !== tool.name) throw Object.assign(new Error(), { code: 'UNKNOWN_TOOL' });
      try { const data = await pilot.call(msg.params.arguments, { signal: controller.signal }); result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }; }
      catch (e) { result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: typeof e.code === 'string' ? e.code : 'OPERATION_FAILED', fallback: 'Continue using native Codex tools; do not claim Jev success.' }) }] }; }
    } else { output({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } }); return; }
    output({ jsonrpc: '2.0', id: msg.id, result });
  } catch { output({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Invalid request' } }); }
  finally { pending.delete(msg.id); }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const tasks = new Set();
lines.on('line', line => {
  if (Buffer.byteLength(line) > 2000000) { output({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }); return; }
  try { const msg = JSON.parse(line); if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') throw new Error(); const task = handle(msg); tasks.add(task); task.finally(() => tasks.delete(task)); }
  catch { output({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
});
lines.on('close', async () => { await Promise.allSettled([...tasks]); pilot.close(); });
