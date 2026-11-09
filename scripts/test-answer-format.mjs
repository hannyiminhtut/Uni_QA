import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAnswerBlocks } from '../lib/answer-format.js';

test('keeps paragraphs separate and groups numbered checklist lines', () => {
  assert.deepEqual(formatAnswerBlocks('Bring these documents:\n\n1. Four photographs\n2. Mark receipt\n\nConfirm with UIT.'), [
    { type: 'paragraph', text: 'Bring these documents:' },
    { type: 'ordered', items: ['Four photographs', 'Mark receipt'] },
    { type: 'paragraph', text: 'Confirm with UIT.' },
  ]);
});
test('formats older Burmese inline lists without changing item words', () => {
  assert.deepEqual(formatAnswerBlocks('လိုအပ်ချက်များ- (၁) ဓာတ်ပုံ ၄ ပုံ (၂) အမှတ်စာရင်း'), [
    { type: 'paragraph', text: 'လိုအပ်ချက်များ-' }, { type: 'ordered', items: ['ဓာတ်ပုံ ၄ ပုံ', 'အမှတ်စာရင်း'] },
  ]);
});
test('does not mistake dates, decimals or literal HTML for lists or markup', () => {
  for (const text of ['CGPA is 2.0.', 'Founded on 3 December 2012.', '<script>alert(1)</script>']) {
    assert.deepEqual(formatAnswerBlocks(text), [{ type: 'paragraph', text }]);
  }
});
