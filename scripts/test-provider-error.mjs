import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderError } from '../lib/provider-error.js';
test('separates key, region, permission, model, schema and quota errors without raw details', async () => {
  for (const [status, message, reason, expected] of [
    [400, 'API key not valid secret-value', 'API_KEY_INVALID', 'PROVIDER_KEY_INVALID'],
    [400, 'User location is not supported for the API use.', '', 'PROVIDER_REGION_UNSUPPORTED'],
    [403, 'private project details', 'SERVICE_DISABLED', 'PROVIDER_SERVICE_DISABLED'],
    [403, 'private restrictions', 'API_KEY_IP_ADDRESS_BLOCKED', 'PROVIDER_ACCESS_DENIED'],
    [404, 'private model name', '', 'PROVIDER_MODEL_UNAVAILABLE'],
    [400, 'Unknown generation setting', '', 'PROVIDER_REQUEST_REJECTED'],
    [429, 'private quota details', '', 'QUOTA_EXCEEDED'],
  ]) {
    const result = await classifyProviderError(Response.json({ error: { message, details: [{ reason }] } }, { status }));
    assert.equal(result.code, expected);
    assert.ok(!result.message.includes('secret-value') && !result.message.includes('private'));
  }
});
