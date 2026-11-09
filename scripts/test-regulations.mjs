import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseRegulations, loadRegulations, buildRegulationContext } from '../lib/regulations.js';

test('loads the 24-page corpus with stable citation IDs and distinct PDF/printed pages', async () => {
  const corpus = await loadRegulations();
  assert.equal(corpus.pages.length, 24);
  assert.equal(corpus.pages[13].id, 'UIT-SRC-025:p14');
  assert.equal(corpus.pages[13].printedPage, 11);
  assert.equal(corpus.pages[0].printedPage, null);
  assert.ok(corpus.pages[13].sections.includes('10.2.3'));
  assert.ok(corpus.pages[19].sections.includes('13.1.2'));
  assert.match(corpus.pages[13].text, /\| 1\s*\| >=90/);
  assert.match(corpus.pages[19].text, /ကျန်းမာရေး/);
});
test('keeps continuation text and includes all operative pages, without contents or gold answers', async () => {
  const corpus = await loadRegulations();
  const context = JSON.parse(buildRegulationContext(corpus));
  assert.equal(context.pages.length, 21);
  assert.equal(context.pages[0].pdfPage, 4);
  assert.equal(context.pages.at(-1).pdfPage, 24);
  for (const page of context.pages) {
    assert.equal(page.text, corpus.pages[page.pdfPage - 1].text);
  }
  assert.ok(corpus.pages[22].sections.includes('14.1'));
  assert.equal(JSON.stringify(context).includes('gold_answer'), false);
});
test('rejects missing, duplicate, nonsequential and empty pages', async () => {
  const raw = await readFile(new URL('../data/regulations.md', import.meta.url), 'utf8');
  for (const text of [raw.replace('=== Page 8 ===', '=== Page 7 ==='), raw.replace('Total Pages: 24', 'Total Pages: 23'), raw.replace('=== Page 24 ===', '=== Page 25 ==='), 'No page markers']) {
    assert.throws(() => parseRegulations(text));
  }
  assert.throws(() => parseRegulations('Source ID: UIT-SRC-025\nCorpus ID: UIT-AC\nCorpus Version: v1\nTotal Pages: 1\n=== Page 1 ===\n'));
});
test('normalizes line endings and detects source changes', async () => {
  const raw = await readFile(new URL('../data/regulations.md', import.meta.url), 'utf8');
  const normalized = raw.replace(/\r\n?/g, '\n');
  assert.equal(parseRegulations(normalized).sha256, parseRegulations(normalized.replace(/\n/g, '\r\n')).sha256);
  assert.notEqual(parseRegulations(raw).sha256, parseRegulations(raw + '\nSource amendment').sha256);
});
