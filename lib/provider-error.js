// Return only allowlisted codes/messages; never expose Google's raw error body.
export async function classifyProviderError(response) {
  let data = null;
  try {
    const reader = response.body?.getReader();
    if (reader) {
      let size = 0, text = '';
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16000) { await reader.cancel(); throw new Error('Oversized error'); }
          text += decoder.decode(value, { stream: true });
        }
        data = JSON.parse(text + decoder.decode());
      } finally { reader.releaseLock(); }
    }
  } catch { /* Keep the status-only fallback. */ }
  const message = typeof data?.error?.message === 'string' ? data.error.message.toLowerCase() : '';
  const reasons = Array.isArray(data?.error?.details) ? data.error.details.map(item => item?.reason) : [];
  if (response.status === 429) return { code: 'QUOTA_EXCEEDED', message: 'The free AI quota or rate limit has been reached. Please wait and try later.', status: 429 };
  if (reasons.some(reason => ['API_KEY_INVALID', 'API_KEY_EXPIRED'].includes(reason)) || /api key not valid|invalid api key|api key expired/.test(message)) {
    return { code: 'PROVIDER_KEY_INVALID', message: 'Gemini rejected the hosted API key. Re-enter a valid key in the Worker secret.', status: 503 };
  }
  if (/location is not supported|unsupported.*location|not available in your (country|region)|region.*not supported/.test(message)) {
    return { code: 'PROVIDER_REGION_UNSUPPORTED', message: 'Gemini rejected the hosting location or regional eligibility. The app requires a provider accessible from this hosting environment.', status: 503 };
  }
  if (reasons.includes('SERVICE_DISABLED')) return { code: 'PROVIDER_SERVICE_DISABLED', message: 'The Gemini API is disabled for the key project. Check API access in Google AI Studio.', status: 503 };
  if (response.status === 403 || reasons.some(reason => typeof reason === 'string' && /^API_KEY_.*BLOCKED$/.test(reason)) || /reported as leaked/.test(message)) {
    return { code: 'PROVIDER_ACCESS_DENIED', message: 'Gemini denied access. Check the key restrictions, project permissions and key status.', status: 503 };
  }
  if (response.status === 404) return { code: 'PROVIDER_MODEL_UNAVAILABLE', message: 'The configured Gemini model is not available to the hosted API key.', status: 503 };
  if (response.status === 400) return { code: 'PROVIDER_REQUEST_REJECTED', message: 'Gemini rejected the request settings. Check model and structured-output compatibility.', status: 503 };
  return { code: 'PROVIDER_CONFIGURATION', message: 'Check the server API key, model availability and account or region access in AI Studio.', status: 503 };
}
