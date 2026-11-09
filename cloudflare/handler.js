import knowledge from '../.cloudflare/knowledge.json';
import { parseChatRequest } from '../lib/chat-request.js';
import { generateAnswer, AnswerError } from '../lib/answering.js';
import { parseLimits } from '../lib/quota-limits.js';

const baseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...baseHeaders, ...extra } });
export function createWorker({ fetchImpl } = {}) {
  return { async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname !== '/api/chat') return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
    if (request.method === 'GET') return json({ status: 'ok', stage: 'cloudflare_ready', answeringEnabled: Boolean(env.GEMINI_API_KEY && env.QUOTA),
      knowledge: { sourceId: knowledge.sourceId, version: knowledge.version, pdfPages: knowledge.pages.filter(p => Number.isInteger(p.pdfPage)).length, regulationPages: knowledge.pages.filter(p => p.kind === 'regulation').length } });
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET or POST.' } }, 405, { Allow: 'GET, POST' });
    const input = await parseChatRequest(request);
    if (input.error) return json({ error: { code: 'INVALID_REQUEST', message: input.error } }, input.status);
    if (!env.GEMINI_API_KEY?.trim()) return json({ error: { code: 'NOT_CONFIGURED', message: 'The assistant is not configured yet.' } }, 503);
    let quotaHeaders = {};
    try {
      const limits = parseLimits({ appMinute: env.APP_REQUESTS_PER_MINUTE, appDay: env.APP_REQUESTS_PER_DAY,
        sessionMinute: env.SESSION_REQUESTS_PER_MINUTE, sessionDay: env.SESSION_REQUESTS_PER_DAY });
      let reservation;
      try {
        if (!env.QUOTA) throw new Error('Missing binding');
        const stub = env.QUOTA.get(env.QUOTA.idFromName('uit-compass-global-v1'));
        const result = await stub.fetch('https://quota.internal/reserve', { method: 'POST', body: JSON.stringify({ cookie: request.headers.get('cookie'), secure: url.protocol === 'https:', limits }) });
        if (!result.ok) throw new Error('Quota unavailable');
        reservation = await result.json();
      } catch { return json({ error: { code: 'QUOTA_UNAVAILABLE', message: 'Quota protection is unavailable. Please try later.' } }, 503, { 'Retry-After': '60' }); }
      quotaHeaders = { 'Set-Cookie': reservation.cookie };
      if (reservation.rejection) return json({ error: { ...reservation.rejection, message: 'The request limit has been reached. Please wait.' } }, 429,
        { ...quotaHeaders, 'Retry-After': String(reservation.rejection.retryAfter) });
      const answer = await generateAnswer({ question: input.question, corpus: knowledge,
        config: { apiKey: env.GEMINI_API_KEY.trim(), model: env.GEMINI_MODEL || 'gemini-3.1-flash-lite' }, fetchImpl, signal: request.signal });
      return json(answer, 200, quotaHeaders);
    } catch (error) {
      if (error instanceof AnswerError) return json({ error: { code: error.code, message: error.message } }, error.status,
        { ...quotaHeaders, ...(error.code === 'QUOTA_EXCEEDED' ? { 'Retry-After': '60' } : {}) });
      return json({ error: { code: 'CONFIGURATION_ERROR', message: 'The assistant could not complete the request.' } }, 503, quotaHeaders);
    }
  } };
}
