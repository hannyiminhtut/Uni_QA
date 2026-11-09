// Run from the project root with Node.js 22+. No dependencies required.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const config = parseEnv(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'));
const key = config.GEMINI_API_KEY?.trim();
const model = config.GEMINI_MODEL?.trim();
if (!key) {
  console.error('Add your NEW API key to GEMINI_API_KEY in .dev.vars, then run again. Do not share the key.');
  process.exit(1);
}
if (!model || !/^[a-zA-Z0-9._-]+$/.test(model)) {
  console.error('Set GEMINI_MODEL in .dev.vars to the exact API model ID.');
  process.exit(1);
}

try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Use only this regulation: A student who does not meet 75% attendance for a subject will not receive credit for that subject. Answer in English, Burmese, and mixed English+Burmese: (1) What happens if attendance is 70%? (2) What is the exact tuition fee? Say when information is not provided. Use ခရက်ဒစ် for academic credit.' }] }],
      generationConfig: { maxOutputTokens: 1500 },
    }),
  });
  if (!response.ok) {
    // Do not print raw provider responses, headers, or credentials.
    const hints = {
      400: 'Check model/request settings and account or region eligibility in AI Studio.',
      401: 'Check the replacement key in .dev.vars.',
      403: 'Check key permissions and account/region eligibility.',
      404: 'Confirm the exact model ID and API availability using Get code in AI Studio.',
      429: 'Free quota or rate limit reached. Check AI Studio and wait; do not enable billing.',
    };
    console.error(`API test failed (HTTP ${response.status}). ${hints[response.status] ?? 'Try again later or check provider status.'}`);
    process.exitCode = 1;
  } else {
    const result = await response.json();
    const output = result.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('\n');
    if (!output) {
      console.error('The API responded but returned no answer text. Check safety/output settings in AI Studio.');
      process.exitCode = 1;
    } else {
      console.log('API connection succeeded. Review the answer for correctness:\n');
      console.log(output.replaceAll(key, '[REDACTED]'));
    }
  }
} catch {
  console.error('Could not complete the request. Check your connection, Node.js version, and provider availability.');
  process.exitCode = 1;
}
