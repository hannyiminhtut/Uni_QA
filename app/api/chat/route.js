import { getServerConfig } from '../../../lib/server-config.js';
import { parseChatRequest } from '../../../lib/chat-request.js';
import { loadKnowledge } from '../../../lib/knowledge.js';
import { generateAnswer, AnswerError } from '../../../lib/answering.js';
import { reserveQuota, QuotaError } from '../../../lib/quota.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200, extraHeaders = {}) => Response.json(body, { status, headers: { ...headers, ...extraHeaders } });

export async function GET() {
  // Health check intentionally exposes neither credentials nor model configuration.
  try {
    const corpus = await loadKnowledge();
    const config = await getServerConfig();
    return json({ status: 'ok', stage: process.env.NODE_ENV === 'production' ? 'shared_quota_storage_required' : 'generation_ready', answeringEnabled: Boolean(config.apiKey) && process.env.NODE_ENV !== 'production',
      knowledge: { sourceId: corpus.sourceId, version: corpus.version,
        pdfPages: corpus.pages.filter(page => Number.isInteger(page.pdfPage)).length, regulationPages: corpus.pages.filter(page => page.kind === 'regulation').length } });
  } catch {
    return json({ status: 'error', stage: 'regulations_unavailable', answeringEnabled: false }, 503);
  }
}

export async function POST(request) {
  let quotaHeaders = {};
  const input = await parseChatRequest(request);
  if (input.error) return json({ error: { code: 'INVALID_REQUEST', message: input.error } }, input.status);
  try {
    const config = await getServerConfig();
    if (!config.apiKey) {
      return json({ error: { code: 'NOT_CONFIGURED', message: 'The assistant is not configured yet.' } }, 503);
    }
    let corpus;
    try {
      corpus = await loadKnowledge();
    } catch {
      return json({ error: { code: 'KNOWLEDGE_UNAVAILABLE', message: 'The regulation document could not be loaded.' } }, 503);
    }
    let reservation;
    try { reservation = await reserveQuota({ request, limits: config.limits }); }
    catch (error) {
      if (error instanceof QuotaError) throw error;
      throw new QuotaError('QUOTA_UNAVAILABLE', 'Quota protection is unavailable. Please try later.', 60, 503);
    }
    quotaHeaders = { 'Set-Cookie': reservation.cookie };
    if (reservation.rejection) throw reservation.rejection;
    return json(await generateAnswer({ question: input.question, corpus, config, signal: request.signal }), 200, quotaHeaders);
  } catch (error) {
    if (error instanceof QuotaError || error instanceof AnswerError) {
      const retryAfter = error instanceof QuotaError ? error.retryAfter : error.code === 'QUOTA_EXCEEDED' ? 60 : null;
      return json({ error: { code: error.code, message: error.message, ...(retryAfter ? { retryAfter } : {}) } }, error.status,
        { ...quotaHeaders, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) });
    }
    return json({ error: { code: 'CONFIGURATION_ERROR', message: 'The assistant configuration could not be loaded.' } }, 503);
  }
}
