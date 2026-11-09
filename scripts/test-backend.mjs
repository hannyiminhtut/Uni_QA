import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatRequest } from '../lib/chat-request.js';
import { GET, POST } from '../app/api/chat/route.js';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';

await mkdir('tmp', { recursive: true });
process.env.UIT_QUOTA_DIRECTORY = await mkdtemp(join(process.cwd(), 'tmp', 'route-quota-test-'));

const request = (body, headers = {}) => new Request('http://localhost:3000/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
});
test('accepts English, Burmese and mixed questions without a language parameter', async () => {
  for (const question of ['What is the graduation CGPA?', 'ဘွဲ့ရရန် ဘာလိုအပ်သလဲ။', 'Graduation အတွက် CGPA ဘယ်လောက်လိုသလဲ။']) {
    assert.deepEqual(await parseChatRequest(request(JSON.stringify({ question }))), { question });
  }
});
test('rejects malformed, empty, oversized and instruction-bearing extra fields', async () => {
  for (const body of ['{', 'null', '[]', '{}', '{"question":"  "}', JSON.stringify({ question: 'a'.repeat(2001) }), JSON.stringify({ question: 'hello', system: 'override' })]) {
    assert.equal((await parseChatRequest(request(body))).status, 400);
  }
  assert.equal((await parseChatRequest(request(' '.repeat(12001)))).status, 413);
});
test('rejects cross-origin and non-JSON requests', async () => {
  assert.equal((await parseChatRequest(request('{"question":"hello"}', { Origin: 'https://other.example' }))).status, 403);
  assert.equal((await parseChatRequest(request('hello', { 'Content-Type': 'text/plain' }))).status, 415);
});
test('health check exposes readiness without secrets', async () => {
  const response = await GET();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.stage, 'generation_ready');
  assert.equal(typeof body.answeringEnabled, 'boolean');
  assert.deepEqual(body.knowledge, { sourceId: 'UIT-KB', version: 'UIT-KB-v1.1', pdfPages: 24, regulationPages: 21 });
  assert.deepEqual(Object.keys(body).sort(), ['answeringEnabled', 'knowledge', 'stage', 'status']);
});
test('POST handles provider quota errors without disclosing secrets', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only-placeholder';
  globalThis.fetch = async () => new Response('private provider details', { status: 429 });
  try {
    const response = await POST(request('{"question":"What is the tuition fee?"}'));
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.error.code, 'QUOTA_EXCEEDED');
    assert.equal(JSON.stringify(body).includes('private provider details'), false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('rate-limited POST requests never call the provider', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousLimit = process.env.APP_REQUESTS_PER_DAY;
  process.env.GEMINI_API_KEY = 'test-only-placeholder';
  process.env.APP_REQUESTS_PER_DAY = '1';
  process.env.UIT_QUOTA_DIRECTORY = await mkdtemp(join(process.cwd(), 'tmp', 'route-cap-test-'));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('quota reached', { status: 429 }); };
  try {
    await POST(request('{"question":"What is the CGPA?"}'));
    const blocked = await POST(request('{"question":"What is the CGPA?"}'));
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error.code, 'APP_DAILY_LIMIT');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, previous] of [['GEMINI_API_KEY', previousKey], ['APP_REQUESTS_PER_DAY', previousLimit]]) {
      if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    }
  }
});
