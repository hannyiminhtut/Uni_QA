import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadRegulations } from './regulations.js';

export async function loadKnowledge() {
  const regulations = await loadRegulations();
  const raw = await readFile(new URL('../data/general-info.json', import.meta.url), 'utf8');
  const general = JSON.parse(raw);
  if (general.sourceId !== 'UIT-GENERAL-001' || !general.version || !Array.isArray(general.records) || !general.records.length) throw new Error('Invalid general information');
  const seen = new Set();
  const pages = general.records.map(record => {
    if (!/^FAQ-[A-Z]+$/.test(record.section) || seen.has(record.section) ||
      ['title', 'text', 'verification', 'caution'].some(key => typeof record[key] !== 'string' || !record[key].trim())) throw new Error('Invalid general record');
    if (record.url !== null && record.url !== 'https://www.uit.edu.mm/') throw new Error('Unexpected source URL');
    seen.add(record.section);
    return { id: `${general.sourceId}:${record.section}`, sourceId: general.sourceId, sourceVersion: general.version,
      title: record.title, url: record.url, verification: record.verification, caution: record.caution,
      collectedDate: general.collectedDate, kind: 'general', pdfPage: null, printedPage: null,
      sections: [record.section], sectionPassages: [{ section: record.section, text: record.text }], text: record.text };
  });
  return { ...regulations, sourceId: 'UIT-KB', version: 'UIT-KB-v1.1',
    sha256: createHash('sha256').update(regulations.sha256 + raw).digest('hex'),
    pages: [...regulations.pages.map(page => ({ ...page, sourceId: regulations.sourceId, sourceVersion: regulations.version })), ...pages] };
}
