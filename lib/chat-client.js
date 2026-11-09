// Browser-safe helper: no keys or server modules belong in this file.
const errors = {
  APP_RATE_LIMIT: 'The app is receiving questions too quickly. Please wait.',
  SESSION_RATE_LIMIT: 'Please wait before sending another question.',
  APP_DAILY_LIMIT: 'The app has reached its daily question limit. Please return after the reset.',
  SESSION_DAILY_LIMIT: 'Your browser session has reached its daily question limit. Please return after the reset.',
  QUOTA_STORAGE_REQUIRED: 'Shared quota protection must be configured before public launch.',
  QUOTA_UNAVAILABLE: 'Quota protection is unavailable. Please try later.',
  QUOTA_BUSY: 'The app is busy checking the quota. Please wait a moment.',
  QUOTA_EXCEEDED: 'The free AI quota or rate limit has been reached. Please wait before trying again.',
  PROVIDER_CONFIGURATION: 'The AI connection needs attention. Check the server configuration and AI Studio access.',
  PROVIDER_KEY_INVALID: 'Gemini rejected the hosted API key. The site owner needs to update the Worker secret.',
  PROVIDER_REGION_UNSUPPORTED: 'Gemini is not available from this hosting location or account region. The site owner needs to review provider availability.',
  PROVIDER_SERVICE_DISABLED: 'The Gemini API is disabled for the configured project.',
  PROVIDER_ACCESS_DENIED: 'Gemini denied access. The site owner needs to check API key restrictions and project permissions.',
  PROVIDER_MODEL_UNAVAILABLE: 'The configured Gemini model is unavailable for this API key.',
  PROVIDER_REQUEST_REJECTED: 'Gemini rejected the request settings. The site owner needs to check model compatibility.',
  NOT_CONFIGURED: 'The assistant is not configured yet.',
  KNOWLEDGE_UNAVAILABLE: 'The regulation document is unavailable. Please try later.',
  INVALID_ANSWER: 'The answer could not be verified against the regulations. Try a more specific question.',
  INCOMPLETE_ANSWER: 'The answer was not completed. Try a shorter, more specific question.',
  PROVIDER_UNAVAILABLE: 'The AI service is unavailable or timed out. Please try later.',
  INVALID_REQUEST: 'Enter a question of no more than 2,000 characters.',
};
export class ChatClientError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export async function requestChat(question, { signal, fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }), signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ChatClientError('NETWORK_ERROR', 'Could not connect. Check your connection and try again.');
  }
  let body;
  try { body = await response.json(); } catch {
    throw new ChatClientError('INVALID_RESPONSE', 'The server returned an unreadable response. Please try later.');
  }
  if (!response.ok) {
    const code = body?.error?.code;
    const retryAfter = Number(response.headers.get('Retry-After'));
    const waitMessage = Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 86400
      ? ` Try again in ${retryAfter < 60 ? `${Math.ceil(retryAfter)} seconds` : `${Math.ceil(retryAfter / 60)} minutes`}.` : '';
    throw new ChatClientError(code || 'REQUEST_FAILED', (errors[code] || 'The request could not be completed. Please try later.') + waitMessage);
  }
  if (!body || typeof body.answer !== 'string' || !body.answer.trim() || !Array.isArray(body.citations) ||
      !['answered', 'partial', 'not_found', 'clarification'].includes(body.status) || !['EN', 'MY', 'MIX'].includes(body.language) ||
      typeof body.source?.version !== 'string' || body.citations.some(citation =>
        typeof citation.section !== 'string' || typeof citation.quote !== 'string' ||
        typeof citation.sourceId !== 'string' || !(Number.isInteger(citation.pdfPage) || (citation.kind === 'general' && citation.pdfPage === null && typeof citation.title === 'string')))) {
    throw new ChatClientError('INVALID_RESPONSE', 'The server returned an unreadable response. Please try later.');
  }
  return body;
}
