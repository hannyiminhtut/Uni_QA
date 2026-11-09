import http from 'node:http';
import { readFile } from 'node:fs/promises';

// Explicit allowlist: never expose project files, API keys, or evaluation answers.
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = files.get(pathname);
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(new URL(`../public/${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500); res.end('Could not load the interface.');
  }
}).listen(5173, '127.0.0.1', () => console.log('UIT Academic QA: http://localhost:5173 (Ctrl+C to stop)'));
