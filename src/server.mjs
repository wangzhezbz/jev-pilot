#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Pilot, operations } from './pilot.mjs';
import { modelResult } from './model-result.mjs';
import { VERSION } from './core.mjs';
import { maintainBrowserNetwork } from './browser-network.mjs';
import {evidenceTool,evidenceArguments} from './evidence-tool.mjs';
let browserNetworkRepair = maintainBrowserNetwork();
const pilot = new Pilot(), pending = new Map();
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
const tool = { name: 'jev_pilot', description: 'Advanced JevPilot operations: configuration, diagnostics, recovery, browser coordination, authorized memory, compaction, review and checkpoints. Consult the relevant bundled operation reference when using these advanced operations. Ordinary read-only evidence uses jev_evidence directly; it needs no skill read or status call. Use normal Codex tools and permissions for execution.', inputSchema: { type: 'object', properties: { workspace: { type: 'string', description: 'Absolute project directory.' }, operation: { type: 'string', enum: Object.keys(operations) }, input: { type: 'object', additionalProperties: true } }, required: ['workspace', 'operation'], additionalProperties: false } };
async function handle(msg) {
  if (msg.method === 'notifications/cancelled') { pending.get(msg.params?.requestId)?.abort(); return; }
  if (!Object.hasOwn(msg, 'id')) return;
  const controller = new AbortController(); pending.set(msg.id, controller);
  try {
    let result;
    if (msg.method === 'initialize') result = { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'jev-pilot', version: VERSION } };
    else if (msg.method === 'ping') result = {};
    else if (msg.method === 'tools/list') result = { tools: [tool,evidenceTool] };
    else if (msg.method === 'tools/call') {
      if (![tool.name,evidenceTool.name].includes(msg.params?.name)) throw Object.assign(new Error(), { code: 'UNKNOWN_TOOL' });
      try {
        const compactEvidence=msg.params.name===evidenceTool.name;
        if(compactEvidence)msg={...msg,params:{...msg.params,arguments:evidenceArguments(msg.params.arguments)}};
        if (['status', 'browser_step'].includes(msg.params.arguments?.operation)) {
          const network = maintainBrowserNetwork();
          browserNetworkRepair = { ...network, repairedEarlierInProcess: browserNetworkRepair.changed === true || browserNetworkRepair.repairedEarlierInProcess === true };
        }
        const data = modelResult(msg.params.arguments.operation, await pilot.call(msg.params.arguments, { signal: controller.signal }),{compactEvidence});
        if (['status', 'browser_step'].includes(msg.params.arguments?.operation)) data.browserNetwork = browserNetworkRepair;
        result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      }
      catch (e) { result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: typeof e.code === 'string' ? e.code : 'OPERATION_FAILED', fallback: e.code === 'WORKSPACE_ABSOLUTE_REQUIRED' ? "Retry once with the absolute task cwd as workspace and input.path relative to it. Do not use the plugin directory. If unavailable, continue natively." : 'Continue using native Codex tools; do not claim Jev success.' }) }] }; }
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
