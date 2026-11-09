import { DurableObject } from 'cloudflare:workers';
import { parseLimits } from '../lib/quota-limits.js';

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function key(secret) {
  const bytes = Uint8Array.from(secret.match(/../g), value => parseInt(value, 16));
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function getSession(cookie, secret) {
  const value = cookie?.match(/(?:^|;\s*)uit_session=([^;]+)/)?.[1];
  const signingKey = await key(secret);
  if (value && /^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) {
    const [id, signature] = value.split('.');
    const bytes = Uint8Array.from(signature.match(/../g), value => parseInt(value, 16));
    if (await crypto.subtle.verify('HMAC', signingKey, bytes, new TextEncoder().encode(id))) return { id, signature };
  }
  const id = crypto.randomUUID();
  return { id, signature: hex(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(id)))) };
}

export class QuotaStore extends DurableObject {
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    return this.ctx.blockConcurrencyWhile(async () => {
      const { cookie, secure, limits: supplied } = await request.json();
      const limits = parseLimits(supplied);
      const now = Date.now();
      const day = new Date(now).toISOString().slice(0, 10);
      let state = await this.ctx.storage.get('budget');
      if (!state) state = { version: 1, secret: hex(crypto.getRandomValues(new Uint8Array(32))), day, count: 0, recent: [], sessions: {} };
      if (state.version !== 1 || typeof state.secret !== 'string' || !Array.isArray(state.recent) || !Number.isInteger(state.count) || state.count < 0 || !state.sessions) throw new Error('Invalid quota state');
      if (state.day !== day) { state.day = day; state.count = 0; state.sessions = {}; }
      state.recent = state.recent.filter(time => time > now - 60000);
      const session = await getSession(cookie, state.secret);
      const entry = state.sessions[session.id] ?? { count: 0, recent: [] };
      entry.recent = entry.recent.filter(time => time > now - 60000);
      const dailyWait = Math.max(1, Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86400000 - now) / 1000));
      let rejection = null;
      if (state.count >= limits.appDay) rejection = { code: 'APP_DAILY_LIMIT', retryAfter: dailyWait };
      else if (entry.count >= limits.sessionDay) rejection = { code: 'SESSION_DAILY_LIMIT', retryAfter: dailyWait };
      else if (state.recent.length >= limits.appMinute) rejection = { code: 'APP_RATE_LIMIT', retryAfter: Math.max(1, Math.ceil((state.recent[0] + 60000 - now) / 1000)) };
      else if (entry.recent.length >= limits.sessionMinute) rejection = { code: 'SESSION_RATE_LIMIT', retryAfter: Math.max(1, Math.ceil((entry.recent[0] + 60000 - now) / 1000)) };
      if (!rejection) {
        state.count++; state.recent.push(now); entry.count++; entry.recent.push(now); state.sessions[session.id] = entry;
      }
      // SQLite-backed durable KV; await persistence before allowing a provider call.
      await this.ctx.storage.put('budget', state);
      return Response.json({ rejection, cookie: `uit_session=${session.id}.${session.signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? '; Secure' : ''}` });
    });
  }
}
