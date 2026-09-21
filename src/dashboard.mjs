import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { Pilot } from './pilot.mjs';
import { packageRoot } from './setup.mjs';
export async function dashboard(workspace, { port = 0, pilot = new Pilot() } = {}) {
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" };
    const respond = (status, body, type = 'application/json') => { res.writeHead(status, { ...headers, 'Content-Type': type + '; charset=utf-8' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    if (req.headers.host !== origin.slice(7)) return respond(403, { error: 'HOST' });
    const path = req.url?.split('?')[0];
    if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
      const file = path === '/' ? 'index.html' : path.slice(1); return respond(200, readFileSync(join(packageRoot, 'web', file), 'utf8'), file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    }
    if (req.method === 'GET' && /^\/locales\/(en|zh-CN|ru|ja|ko)\.json$/.test(path)) return respond(200, JSON.parse(readFileSync(join(packageRoot, path.slice(1)), 'utf8')));
    if (req.headers.authorization !== 'Bearer ' + token || req.headers.origin && req.headers.origin !== origin) return respond(403, { error: 'AUTH' });
    try {
      if (req.method === 'GET' && path === '/api/status') return respond(200, { status: await pilot.call({ workspace, operation: 'status' }), metrics: await pilot.call({ workspace, operation: 'metrics' }), desktop: await pilot.call({ workspace, operation: 'desktop_status' }), routing: await pilot.call({ workspace, operation: 'desktop_metrics' }) });
      if (req.method === 'POST' && ['/api/config', '/api/key'].includes(path)) {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return respond(413, { error: 'LIMIT' }); }
        const data = JSON.parse(raw);
        if (path === '/api/key') {
          if (typeof data.key !== 'string' || !/^apikey_[A-Za-z0-9_-]{16,512}$/.test(data.key)) return respond(400, { error: 'INVALID_KEY' });
          const file = join(pilot.store.home, '.env.local'); writeFileSync(file, 'TYPESAFE_API_KEY=' + data.key + '\n', { mode: 0o600 }); chmodSync(file, 0o600); return respond(200, { saved: true });
        }
        return respond(200, await pilot.call({ workspace, operation: 'configure', input: data }));
      }
      return respond(404, { error: 'NOT_FOUND' });
    } catch { respond(400, { error: 'INVALID_REQUEST' }); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  server.on('close', () => pilot.close());
  return { url: `http://127.0.0.1:${server.address().port}/#${token}`, close: () => server.close(), server };
}
