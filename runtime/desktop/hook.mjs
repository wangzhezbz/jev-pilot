// Synchronous boundary hook. Forward only the adapter's bounded text feedback.
import { connect } from 'node:net';
let input = '';
let result = {};
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 2_000_000) throw new Error('LIMIT');
  }
  const payload = JSON.parse(input);
  const path = process.env.JEV_BRIDGE_SOCKET;
  if (path && ['UserPromptSubmit', 'PostToolUse'].includes(payload.hook_event_name)) {
    await new Promise(resolve => {
      const socket = connect(path);
      let data = '';
      const done = () => { clearTimeout(timer); socket.destroy(); resolve(); };
      const timer = setTimeout(done, 12_000);
      socket.on('error', done).on('end', done).on('data', chunk => {
        data += chunk;
        if (data.length > 120000) return done();
        if (!data.includes('\n')) return;
        try { const r = JSON.parse(data); if (payload.hook_event_name === 'PostToolUse' && r.continue === false && typeof r.stopReason === 'string') result = { continue: false, stopReason: r.stopReason }; } catch {}
        done();
      });
      socket.on('connect', () => socket.write(JSON.stringify(payload) + '\n'));
    });
  }
} catch { /* Fail open: the original Codex task continues. */ }
process.stdout.write(JSON.stringify(result)+'\n');
