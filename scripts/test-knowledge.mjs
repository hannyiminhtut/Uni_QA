import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledge } from '../lib/knowledge.js';
import { buildRegulationContext } from '../lib/regulations.js';
import { validateAnswer, generateAnswer } from '../lib/answering.js';
import { requestChat } from '../lib/chat-client.js';

test('adds separately attributed records without changing regulation page numbers', async () => {
  const corpus = await loadKnowledge();
  assert.equal(corpus.pages.filter(p => p.kind === 'regulation').length, 21);
  assert.equal(corpus.pages.filter(p => p.kind === 'general').length, 4);
  assert.equal(corpus.pages[13].pdfPage, 14);
  const context = JSON.parse(buildRegulationContext(corpus));
  const admissions = context.pages.find(p => p.indexedSections.includes('FAQ-ADMISSIONS'));
  assert.equal(admissions.pdfPage, null);
  assert.match(admissions.caution, /not confirmed current/);
  assert.match(admissions.text, /450/);
});
test('general answers have real record citations, not invented PDF page numbers', async () => {
  const corpus = await loadKnowledge();
  for (const section of ['FAQ-HISTORY', 'FAQ-CONTACT', 'FAQ-ADMISSIONS', 'FAQ-PROGRAMMES']) {
    const record = corpus.pages.find(p => p.sections.includes(section));
    const value = { status: 'answered', language: 'EN', answer: 'According to the supplied university information.',
      citations: [{ citationId: record.id, section, quote: record.text.split('\n')[0] }] };
    const result = validateAnswer(value, corpus);
    assert.equal(result.citations[0].kind, 'general');
    assert.equal(result.citations[0].pdfPage, null);
    assert.equal(result.citations[0].sourceId, 'UIT-GENERAL-001');
    assert.ok(result.citations[0].verification);
    if (section === 'FAQ-ADMISSIONS') assert.match(result.answer, /not verified for the current intake/);
    assert.deepEqual(await requestChat('General question', { fetchImpl: async () => Response.json(result) }), result);
    assert.throws(() => validateAnswer({ ...value, citations: [{ ...value.citations[0], section: '15.1' }] }, corpus));
  }
});
test('original regulation evidence remains valid in the combined corpus', async () => {
  const corpus = await loadKnowledge();
  const page = corpus.pages[13];
  const result = validateAnswer({ status: 'answered', language: 'EN', answer: 'A+ receives grade point 4.0.',
    citations: [{ citationId: page.id, section: '10.2.3', quote: page.text.split('\n').find(line => line.includes('>=90')) }] }, corpus);
  assert.equal(result.citations[0].sourceId, 'UIT-SRC-025');
  assert.equal(result.citations[0].pdfPage, 14);
});
test('generation receives both sources and warnings, with no live provider call', async () => {
  const corpus = await loadKnowledge();
  await generateAnswer({ question: 'When was UIT founded?', corpus, config: { model: 'gemini-3.1-flash-lite', apiKey: 'test-key' }, fetchImpl: async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.systemInstruction.parts[0].text, /3 December 2012/);
    assert.match(payload.contents[0].parts[0].text, /FAQ-HISTORY/);
    assert.match(payload.contents[0].parts[0].text, /UIT-SRC-025:p24/);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ status: 'clarification', language: 'EN', answer: 'Do you mean establishment or renaming?', citations: [] }) }] } }] });
  } });
});
