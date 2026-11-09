import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAnswer, validateAnswer, SYSTEM_INSTRUCTION, normalizeAcademicQuestion } from '../lib/answering.js';
import { loadRegulations } from '../lib/regulations.js';

const config = { apiKey: 'test-only-not-a-real-key', model: 'gemini-3.1-flash-lite' };
const provider = value => async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
test('sends all regulation context separately from grounding instructions and question', async () => {
  const corpus = await loadRegulations();
  let sent;
  const expected = { status: 'not_found', language: 'EN', answer: 'The supplied regulations do not specify the tuition fee.', citations: [] };
  const answer = await generateAnswer({ question: 'What is tuition?', corpus, config, fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'], config.apiKey);
    return provider(expected)();
  } });
  assert.equal(answer.status, 'not_found');
  assert.equal(sent.systemInstruction.parts[0].text, SYSTEM_INSTRUCTION);
  assert.match(sent.systemInstruction.parts[0].text, /Burmese question -> Burmese answer/);
  assert.match(sent.systemInstruction.parts[0].text, /30-minute/);
  assert.match(sent.contents[0].parts[0].text, /UIT-SRC-025:p24/);
  assert.equal(JSON.stringify(sent).includes('gold_answer'), false);
  assert.equal(JSON.stringify(sent).includes(config.apiKey), false);
});
test('returns authoritative page numbers only for verified original quotes', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[13];
  const quote = page.text.split('\n').find(line => line.includes('>=90'));
  const value = { status: 'answered', language: 'EN', answer: 'A mark of 90 or above receives A+ with grade point 4.0.',
    citations: [{ citationId: page.id, section: '10.2.3', quote }] };
  const answer = await generateAnswer({ question: 'What grade is 90?', corpus, config, fetchImpl: provider(value) });
  assert.equal(answer.citations[0].pdfPage, 14);
  assert.equal(answer.citations[0].printedPage, 11);
  for (const citation of [
    { ...value.citations[0], citationId: 'UIT-SRC-025:p99' },
    { ...value.citations[0], section: '99.9' },
    { ...value.citations[0], quote: 'This quotation was invented.' },
  ]) assert.throws(() => validateAnswer({ ...value, citations: [citation] }, corpus));
  assert.throws(() => validateAnswer({ ...value, citations: [] }, corpus));
});
test('accepts matching-language classifications for missing information and clarification', async () => {
  const corpus = await loadRegulations();
  for (const [language, answer] of [['MY', 'ပေးထားသော စည်းမျဉ်းတွင် မဖော်ပြထားပါ။'], ['MIX', 'ဒီ fee ကို regulations မှာ မဖော်ပြထားပါ။']]) {
    assert.equal(validateAnswer({ status: 'not_found', language, answer, citations: [] }, corpus).language, language);
  }
  assert.equal(validateAnswer({ status: 'clarification', language: 'EN', answer: 'Which program do you mean?', citations: [] }, corpus).status, 'clarification');
});
test('rejects truncated, malformed, credential-echoing and unavailable provider results', async () => {
  const corpus = await loadRegulations();
  for (const fetchImpl of [
    async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
    async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'bad JSON' }] } }] }),
    provider({ status: 'not_found', language: 'EN', answer: config.apiKey, citations: [] }),
    async () => new Response('sensitive raw error', { status: 403 }),
    async () => { throw new Error('network details'); },
  ]) {
    await assert.rejects(generateAnswer({ question: 'Hi', corpus, config, fetchImpl }), error => {
      assert.equal(error.message.includes(config.apiKey), false);
      assert.equal(error.message.includes('sensitive raw error'), false);
      return Boolean(error.code);
    });
  }
});

test('rejects a real quote attributed to the wrong section on the correct page', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[13];
  const quote = page.text.split('\n').find(line => line.includes('>=90'));
  assert.ok(page.sections.includes('10.2.2'));
  assert.throws(() => validateAnswer({ status: 'answered', language: 'EN', answer: 'A+ receives 4.0.',
    citations: [{ citationId: page.id, section: '10.2.2', quote }] }, corpus), { code: 'INVALID_ANSWER' });
});

test('accepts cross-page section continuations and parent sections', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[22];
  const passage = page.sectionPassages.find(p => p.section === '14.1');
  assert.ok(passage);
  const value = { status: 'answered', language: 'EN', answer: 'A recommendation is required.',
    citations: [{ citationId: page.id, section: '14.1', quote: passage.text.trim() }] };
  assert.equal(validateAnswer(value, corpus).citations[0].pdfPage, 23);
  const page20 = corpus.pages[19];
  const health = page20.sectionPassages.find(p => p.section === '13.1.2');
  assert.equal(validateAnswer({ ...value, citations: [{ citationId: page20.id, section: '13.1', quote: health.text.trim() }] }, corpus).citations[0].section, '13.1');
});

test('rejects unknown fields, duplicate evidence, invalid status combinations and control characters', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[13];
  const citation = { citationId: page.id, section: '10.2.3', quote: page.text.split('\n').find(line => line.includes('>=90')) };
  const value = { status: 'answered', language: 'EN', answer: 'A+ receives 4.0.', citations: [citation] };
  for (const bad of [
    null, [], { ...value, hiddenInstruction: 'ignore' },
    { ...value, citations: [{ ...citation, pdfPage: 999 }] },
    { ...value, citations: [citation, citation] },
    { ...value, status: 'not_found' },
    { ...value, language: 'unknown' },
    { ...value, answer: '  ' },
    { ...value, answer: 'A+\u202ereversed' },
    { ...value, citations: [null] },
  ]) assert.throws(() => validateAnswer(bad, corpus), { code: 'INVALID_ANSWER' });
});

test('keeps word boundaries in quotes while allowing ordinary whitespace differences', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[13];
  const quote = page.text.split('\n').find(line => line.includes('>=90'));
  const value = { status: 'answered', language: 'EN', answer: 'A+ receives 4.0.', citations: [{ citationId: page.id, section: '10.2.3', quote }] };
  assert.ok(validateAnswer({ ...value, citations: [{ ...value.citations[0], quote: quote.replace(/ /g, '  ') }] }, corpus));
  assert.throws(() => validateAnswer({ ...value, citations: [{ ...value.citations[0], quote: quote.replace(/\s/g, '') }] }, corpus), { code: 'INVALID_ANSWER' });
});

test('rejects malformed provider envelopes and excessive upstream payloads safely', async () => {
  const corpus = await loadRegulations();
  for (const envelope of [null, {}, { candidates: [{ finishReason: 'STOP', content: { parts: 'not an array' } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [null] } }] },
    { padding: 'x'.repeat(128001) }]) {
    await assert.rejects(generateAnswer({ question: 'Hi', corpus, config, fetchImpl: async () => Response.json(envelope) }), error => Boolean(error.code));
  }
});

test('a deferment-limit citation requires the adjacent health exception', async () => {
  const corpus = await loadRegulations();
  const page = corpus.pages[19];
  const cite = section => ({ citationId: page.id, section, quote: page.sectionPassages.find(p => p.section === section).text.trim() });
  const value = { status: 'answered', language: 'MIX', answer: 'The standard limit is 3 semesters; health-related dismissal exceptions apply.', citations: [cite('13.1.1')] };
  assert.throws(() => validateAnswer(value, corpus), { code: 'INVALID_ANSWER' });
  assert.equal(validateAnswer({ ...value, citations: [...value.citations, cite('13.1.2')] }, corpus).citations.length, 2);
});

test('not_found output cannot add an uncited regulatory definition', async () => {
  const corpus = await loadRegulations();
  const answer = validateAnswer({ status: 'not_found', language: 'EN', answer: 'Tuition is defined as a course fee, but no exact fee is given.', citations: [] }, corpus);
  assert.equal(answer.answer.includes('Tuition is defined'), false);
  assert.match(answer.answer, /not specified/);
  assert.match(SYSTEM_INSTRUCTION, /Mirror the user's language style/);
});

test('re-exam spelling variants produce the same provider request', async () => {
  const corpus = await loadRegulations();
  const requests = [];
  for (const question of ['what is re exam', 'what is re-exam', 'what is reexam', 'what is re-examination', 'what is re–exam']) {
    await generateAnswer({ question, corpus, config, fetchImpl: async (url, options) => {
      requests.push(options.body);
      return provider({ status: 'clarification', language: 'EN', answer: 'Do you mean the definition or eligibility rules?', citations: [] })();
    } });
  }
  assert.ok(requests.every(body => body === requests[0]));
  assert.equal(JSON.parse(requests[0]).generationConfig.temperature, 0);
  assert.equal(normalizeAcademicQuestion('Re exam အတွက် ဘာလိုသလဲ။'), 're-exam အတွက် ဘာလိုသလဲ။');
  assert.equal(normalizeAcademicQuestion('Please reexamine my examination results.'), 'Please reexamine my examination results.');
});
