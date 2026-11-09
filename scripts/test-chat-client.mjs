import test from 'node:test';
import assert from 'node:assert/strict';
import { requestChat } from '../lib/chat-client.js';

const answer = { status: 'not_found', language: 'EN', answer: 'The fee is not specified.', citations: [], source: { version: 'UIT-AC-v1.0' } };
test('sends only the question to the local backend and preserves the structured answer', async () => {
  const result = await requestChat('What is the fee?', { fetchImpl: async (url, options) => {
    assert.equal(url, '/api/chat');
    assert.deepEqual(JSON.parse(options.body), { question: 'What is the fee?' });
    assert.equal(options.headers['x-goog-api-key'], undefined);
    return Response.json(answer);
  } });
  assert.deepEqual(result, answer);
});
test('shows safe quota errors without auto-retrying or displaying raw server messages', async () => {
  let calls = 0;
  await assert.rejects(requestChat('Hello', { fetchImpl: async () => {
    calls++;
    return Response.json({ error: { code: 'QUOTA_EXCEEDED', message: 'private server details' } }, { status: 429 });
  } }), error => error.code === 'QUOTA_EXCEEDED' && !error.message.includes('private server details'));
  assert.equal(calls, 1);
});
test('rejects malformed responses instead of rendering them as answers', async () => {
  for (const body of [null, {}, { ...answer, citations: [{}] }, { ...answer, answer: '' }, { ...answer, language: 'invalid' }]) {
    await assert.rejects(requestChat('Hi', { fetchImpl: async () => Response.json(body) }), { code: 'INVALID_RESPONSE' });
  }
  await assert.rejects(requestChat('Hi', { fetchImpl: async () => new Response('<html>Error</html>') }), { code: 'INVALID_RESPONSE' });
});
test('distinguishes connection failure from user cancellation', async () => {
  await assert.rejects(requestChat('Hi', { fetchImpl: async () => { throw new Error('network detail'); } }), { code: 'NETWORK_ERROR' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestChat('Hi', { signal: controller.signal, fetchImpl: async () => { throw new DOMException('Stopped', 'AbortError'); } }), { name: 'AbortError' });
});

test('application quota errors display retry timing without retrying automatically', async () => {
  let calls = 0;
  await assert.rejects(requestChat('Hi', { fetchImpl: async () => {
    calls++;
    return Response.json({ error: { code: 'APP_RATE_LIMIT' } }, { status: 429, headers: { 'Retry-After': '45' } });
  } }), error => error.code === 'APP_RATE_LIMIT' && error.message.includes('45 seconds'));
  assert.equal(calls, 1);
});
