import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reserveQuota, parseLimits } from '../lib/quota.js';

await mkdir('tmp', { recursive: true });
const scratch = () => mkdtemp(join(process.cwd(), 'tmp', 'quota-test-'));
const baseTime = Date.parse('2026-11-07T12:00:00Z');
const request = cookie => new Request('http://localhost:3000/api/chat', { headers: cookie ? { cookie } : {} });
const limits = { appMinute: 3, appDay: 10, sessionMinute: 2, sessionDay: 5 };
const reserve = options => reserveQuota({ request: request(), limits, now: baseTime, production: false, ...options });

test('per-session minute limit persists and includes a reset interval', async () => {
  const directory = await scratch();
  const first = await reserve({ directory });
  assert.match(first.cookie, /HttpOnly; SameSite=Strict/);
  const session = request(first.cookie.split(';')[0]);
  assert.equal((await reserve({ directory, request: session })).rejection, undefined);
  const blocked = await reserve({ directory, request: session });
  assert.equal(blocked.rejection.code, 'SESSION_RATE_LIMIT');
  assert.equal(blocked.rejection.retryAfter, 60);
  assert.equal((await reserve({ directory, request: session, now: baseTime + 60000 })).rejection, undefined);
});
test('changing browser identity cannot bypass the global cap, including parallel requests', async () => {
  const directory = await scratch();
  const results = await Promise.all(Array.from({ length: 7 }, () => reserve({ directory })));
  assert.equal(results.filter(result => !result.rejection).length, 3);
  assert.ok(results.filter(result => result.rejection).every(result => result.rejection.code === 'APP_RATE_LIMIT'));
});
test('daily global and session limits survive new calls and reset at UTC midnight', async () => {
  const directory = await scratch();
  const daily = { appMinute: 5, appDay: 2, sessionMinute: 5, sessionDay: 1 };
  const first = await reserve({ directory, limits: daily });
  assert.equal((await reserve({ directory, limits: daily, request: request(first.cookie.split(';')[0]) })).rejection.code, 'SESSION_DAILY_LIMIT');
  assert.equal((await reserve({ directory, limits: daily })).rejection, undefined);
  assert.equal((await reserve({ directory, limits: daily })).rejection.code, 'APP_DAILY_LIMIT');
  assert.equal((await reserve({ directory, limits: daily, now: Date.parse('2026-11-08T00:00:00Z') })).rejection, undefined);
});
test('invalid configurations and corrupted storage fail closed', async () => {
  assert.throws(() => parseLimits({ appDay: 0 }));
  assert.throws(() => parseLimits({ appDay: 'not-a-number' }));
  const directory = await scratch();
  await writeFile(join(directory, 'state.json'), '{broken');
  await assert.rejects(reserve({ directory }));
  await assert.rejects(reserve({ directory, production: true }), { code: 'QUOTA_STORAGE_REQUIRED', status: 503 });
});
test('forged session signatures get a new ID and secure connections get a Secure cookie', async () => {
  const directory = await scratch();
  const fake = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const result = await reserve({ directory, request: new Request('https://example.test/api/chat', { headers: { cookie: `uit_session=${fake}.${'0'.repeat(64)}` } }) });
  assert.ok(!result.cookie.includes(fake));
  assert.match(result.cookie, /; Secure$/);
});
