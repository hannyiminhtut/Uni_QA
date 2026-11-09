const MAX_BYTES = 12_000;
export async function parseChatRequest(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return { error: 'Requests must come from this application.', status: 403 };
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return { error: 'Send the question as JSON.', status: 415 };
  }
  // Bound streamed bytes too; Content-Length alone cannot enforce this limit.
  const reader = request.body?.getReader();
  if (!reader) return { error: 'A question is required.', status: 400 };
  let size = 0;
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return { error: 'Request is too large.', status: 413 };
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== 'object' ||
        Object.keys(body).some(key => key !== 'question') || typeof body.question !== 'string') {
      return { error: 'Provide only a question string.', status: 400 };
    }
    const question = body.question.trim();
    if (!question || question.length > 2000) {
      return { error: 'Question must contain between 1 and 2,000 characters.', status: 400 };
    }
    return { question };
  } catch {
    return { error: 'Request must contain valid JSON and UTF-8 text.', status: 400 };
  } finally { reader.releaseLock(); }
}
