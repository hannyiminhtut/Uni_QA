import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { resolve, join } from 'node:path';

await mkdir('tmp', { recursive: true });
const directory = await mkdtemp(join(resolve('tmp'), 'cloudflare-integration-'));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.name = 'uit-compass-local-integration';
config.main = resolve('cloudflare/test-entry.js');
config.assets.directory = resolve('.cloudflare/frontend/out');
config.vars = { ...config.vars, APP_REQUESTS_PER_MINUTE: '4', APP_REQUESTS_PER_DAY: '10', SESSION_REQUESTS_PER_MINUTE: '2', SESSION_REQUESTS_PER_DAY: '4' };
const configPath = join(directory, 'wrangler.json');
await writeFile(configPath, JSON.stringify(config));
// Test config has its own directory and fake key: never load the real root secret file.
await writeFile(join(directory, '.dev.vars'), 'GEMINI_API_KEY="local-integration-fake-key"\n');
const port = 8788;
const base = `http://127.0.0.1:${port}`;
let child, output = '';
async function start() {
  child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--config', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', join(directory, 'state')], {
    cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`Local runtime exited. ${output.slice(-3000)}`);
    try { const response = await fetch(`${base}/api/chat`, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local runtime did not start. ${output.slice(-3000)}`);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') await new Promise(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, resolve));
  else child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
}
const ask = (question, extra = {}) => fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ question }) });
try {
  await start();
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Big questions/);
  assert.equal((await fetch(`${base}/uit-logo.png`)).status, 200);
  for (const path of ['/.dev.vars', '/data/regulations.md', '/evaluation/questions.csv', '/knowledge.json']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await ask('hello', { Origin: 'https://foreign.test' })).status, 403);
  const invalid = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  const first = await ask('What is the exact tuition fee?');
  assert.equal(first.status, 200);
  assert.match(first.headers.get('set-cookie'), /HttpOnly/);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  assert.equal((await first.json()).status, 'not_found');
  const cited = await ask('simulate cited');
  assert.equal(cited.status, 200);
  assert.equal((await cited.json()).citations[0].sourceId, 'UIT-GENERAL-001');
  assert.equal((await ask('simulate invalid')).status, 502);
  assert.equal((await ask('simulate quota')).status, 429);
  const blocked = await ask('third request');
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, 'APP_RATE_LIMIT');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  console.log('PASS: static UI, logo, private-file isolation, request validation, simulated generation, provider error, shared quota.');
  await stop();
  await start();
  const afterRestart = await ask('after restart');
  assert.equal(afterRestart.status, 429);
  assert.equal((await afterRestart.json()).error.code, 'APP_RATE_LIMIT');
  console.log('PASS: SQLite quota state persists across runtime restart. No deployment or real Gemini call.');
  await stop();
  config.vars.APP_REQUESTS_PER_MINUTE = '10';
  config.vars.SESSION_REQUESTS_PER_MINUTE = '1';
  await writeFile(configPath, JSON.stringify(config));
  await start();
  const sessionBlocked = await ask('same browser', { Cookie: cookie });
  assert.equal(sessionBlocked.status, 429);
  assert.equal((await sessionBlocked.json()).error.code, 'SESSION_RATE_LIMIT');
  await stop();
  config.vars.APP_REQUESTS_PER_DAY = '4';
  await writeFile(configPath, JSON.stringify(config));
  await start();
  const dayBlocked = await ask('daily limit');
  assert.equal(dayBlocked.status, 429);
  assert.equal((await dayBlocked.json()).error.code, 'APP_DAILY_LIMIT');
  console.log('PASS: shared browser-session and daily limits work in the actual local Durable Object.');
} finally { await stop(); }
