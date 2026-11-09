import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { parseLimits } from './quota.js';

// Imported by server routes only. Never import this module into a client component.
export async function getServerConfig() {
  let local = {};
  if (process.env.NODE_ENV !== 'production') {
    try {
      local = parseEnv(await readFile(new URL('../.dev.vars', import.meta.url), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return {
    apiKey: (process.env.GEMINI_API_KEY ?? local.GEMINI_API_KEY ?? '').trim(),
    model: (process.env.GEMINI_MODEL ?? local.GEMINI_MODEL ?? 'gemini-3.1-flash-lite').trim(),
    limits: parseLimits({
      appMinute: process.env.APP_REQUESTS_PER_MINUTE ?? local.APP_REQUESTS_PER_MINUTE,
      appDay: process.env.APP_REQUESTS_PER_DAY ?? local.APP_REQUESTS_PER_DAY,
      sessionMinute: process.env.SESSION_REQUESTS_PER_MINUTE ?? local.SESSION_REQUESTS_PER_MINUTE,
      sessionDay: process.env.SESSION_REQUESTS_PER_DAY ?? local.SESSION_REQUESTS_PER_DAY,
    }),
  };
}
