// Local integration test entry only. Never referenced by wrangler.jsonc.
import { createWorker } from './handler.js';
import knowledge from '../.cloudflare/knowledge.json';
export { QuotaStore } from './quota-store.js';
export default createWorker({ fetchImpl: async (url, options) => {
  const input = JSON.parse(options.body);
  const question = JSON.parse(input.contents[0].parts[1].text.split('\n').slice(1).join('\n')).question;
  if (question === 'simulate quota') return Response.json({ error: 'test quota' }, { status: 429 });
  if (question === 'simulate invalid') return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }] });
  if (question === 'simulate cited') {
    const page = knowledge.pages.find(p => p.sections.includes('FAQ-CONTACT'));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
      status: 'answered', language: 'EN', answer: 'UIT is located at Parami Road, Hlaing Campus, Yangon.',
      citations: [{ citationId: page.id, section: 'FAQ-CONTACT', quote: page.text }],
    }) }] } }] });
  }
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
    status: 'not_found', language: 'EN', answer: 'The requested information is not specified.', citations: [],
  }) }] } }] });
} });
