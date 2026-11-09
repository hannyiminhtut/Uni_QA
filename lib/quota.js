import { defaultLimits } from './quota-limits.js';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

const MINUTE = 60000;
const defaultDirectory = join(process.cwd(), '.quota');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export class QuotaError extends Error {
  constructor(code, message, retryAfter = 60, status = 429) {
    super(message); this.code = code; this.retryAfter = retryAfter; this.status = status;
  }
}
export { defaultLimits, parseLimits } from './quota-limits.js';
const sign = (id, secret) => createHmac('sha256', secret).update(id).digest('hex');
function sessionFromCookie(header, secret) {
  const value = header?.match(/(?:^|;\s*)uit_session=([^;]+)/)?.[1];
  if (!value || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) return randomUUID();
  const [id, signature] = value.split('.');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id, secret))) ? id : randomUUID();
}

export async function reserveQuota({ request, limits = defaultLimits, directory = process.env.UIT_QUOTA_DIRECTORY ?? defaultDirectory, now = Date.now(), production = process.env.NODE_ENV === 'production' }) {
  // Ephemeral/serverless replicas must not silently maintain independent budgets.
  if (production) throw new QuotaError('QUOTA_STORAGE_REQUIRED', 'Shared quota protection must be configured before public launch.', 60, 503);
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, 'state.lock');
  let lock;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { lock = await open(lockPath, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await wait(25); }
  }
  if (!lock) throw new QuotaError('QUOTA_BUSY', 'Quota protection is busy. Please try again shortly.', 2, 503);
  const statePath = join(directory, 'state.json');
  const temporary = join(directory, `${randomUUID()}.tmp`);
  try {
    let state;
    try { state = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { version: 1, secret: randomBytes(32).toString('hex'), day: '', dayCount: 0, recent: [], sessions: {} };
    }
    if (state.version !== 1 || !/^[a-f0-9]{64}$/.test(state.secret) || !Array.isArray(state.recent) ||
        !Number.isInteger(state.dayCount) || state.dayCount < 0 || !state.sessions || typeof state.sessions !== 'object') throw new Error('Invalid quota state');
    const day = new Date(now).toISOString().slice(0, 10);
    const nextMidnight = Date.parse(`${day}T00:00:00Z`) + 86400000;
    const dailyWait = Math.max(1, Math.ceil((nextMidnight - now) / 1000));
    if (state.day !== day) { state.day = day; state.dayCount = 0; state.sessions = {}; }
    state.recent = state.recent.filter(timestamp => timestamp > now - MINUTE);
    const id = sessionFromCookie(request.headers.get('cookie'), state.secret);
    const session = state.sessions[id] ?? { count: 0, recent: [] };
    session.recent = session.recent.filter(timestamp => timestamp > now - MINUTE);
    const cookie = `uit_session=${id}.${sign(id, state.secret)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
    let rejection;
    if (state.dayCount >= limits.appDay) rejection = new QuotaError('APP_DAILY_LIMIT', 'The application daily limit has been reached.', dailyWait);
    else if (session.count >= limits.sessionDay) rejection = new QuotaError('SESSION_DAILY_LIMIT', 'Your browser session daily limit has been reached.', dailyWait);
    else if (state.recent.length >= limits.appMinute) rejection = new QuotaError('APP_RATE_LIMIT', 'The application is receiving questions too quickly.', Math.max(1, Math.ceil((state.recent[0] + MINUTE - now) / 1000)));
    else if (session.recent.length >= limits.sessionMinute) rejection = new QuotaError('SESSION_RATE_LIMIT', 'Please wait before sending another question.', Math.max(1, Math.ceil((session.recent[0] + MINUTE - now) / 1000)));
    if (!rejection) {
      state.dayCount++; state.recent.push(now);
      session.count++; session.recent.push(now); state.sessions[id] = session;
    }
    // Persist before the provider request. Failed/cancelled requests still consume a slot.
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, statePath);
    return { cookie, rejection };
  } finally {
    try { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    finally { await lock.close(); await unlink(lockPath); }
  }
}
