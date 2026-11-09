import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Server-side source loading only. Evaluation answers are never loaded here.
const corpusPath = new URL('../data/regulations.md', import.meta.url);
const digits = '၀၁၂၃၄၅၆၇၈၉';
const normalizeNumber = value => value.replace(/[၀-၉ဝ]/g, c => c === 'ဝ' ? '0' : String(digits.indexOf(c)));

function sectionNumber(line) {
  const match = line.match(/^\s*([၀-၉ဝ0-9]+(?:\.[၀-၉ဝ0-9]+)*)(?:။|[ \t]+)(.*)$/u);
  if (!match) return null;
  const number = normalizeNumber(match[1]);
  if (Number(number.split('.')[0]) < 1 || Number(number.split('.')[0]) > 16) return null;
  if (!/[\u1000-\u109f]/u.test(match[2]) && !number.includes('.')) return null;
  return number;
}

export function parseRegulations(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const markers = [...text.matchAll(/^=== Page (\d+) ===[ \t]*$/gm)];
  if (!markers.length) throw new Error('Regulations have no page markers.');
  const metadataText = text.slice(0, markers[0].index);
  const metadata = Object.fromEntries(metadataText.split('\n').filter(line => line.includes(':')).map(line => {
    const colon = line.indexOf(':');
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  }));
  for (const field of ['Source ID', 'Corpus ID', 'Corpus Version', 'Total Pages']) {
    if (!metadata[field]) throw new Error(`Missing corpus field: ${field}`);
  }
  if (!/^[A-Za-z0-9-]+$/.test(metadata['Source ID'])) throw new Error('Invalid source ID.');
  const count = Number(metadata['Total Pages']);
  if (!Number.isInteger(count) || count !== markers.length) throw new Error('Page count does not match metadata.');
  let activeSection = null;
  const pages = markers.map((marker, index) => {
    const pdfPage = Number(marker[1]);
    if (pdfPage !== index + 1) throw new Error('Pages must be unique and sequential.');
    const body = text.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? text.length).trim();
    if (!body) throw new Error(`Empty regulation page: ${pdfPage}`);
    const sections = [];
    const sectionPassages = [];
    // Pages 1-3 are cover/contents, not operative rule text.
    if (pdfPage >= 4) {
      if (activeSection) sections.push(activeSection);
      for (const line of body.split('\n')) {
        const number = sectionNumber(line);
        if (number) {
          activeSection = number;
          if (!sections.includes(number)) sections.push(number);
        }
        // Associate original text with its actual section, including continuations.
        const last = sectionPassages.at(-1);
        if (last && last.section === activeSection) last.text += `\n${line}`;
        else sectionPassages.push({ section: activeSection, text: line });
      }
    }
    return {
      id: `${metadata['Source ID']}:p${pdfPage}`,
      pdfPage,
      printedPage: pdfPage >= 4 ? pdfPage - 3 : null,
      kind: pdfPage === 1 ? 'cover' : pdfPage <= 3 ? 'contents' : 'regulation',
      // This index includes the section continuing from the previous page.
      // It is an aid to retrieval, not proof that a claim is supported.
      sections,
      sectionPassages,
      text: body,
    };
  });
  return {
    sourceId: metadata['Source ID'],
    corpusId: metadata['Corpus ID'],
    version: metadata['Corpus Version'],
    title: metadata.Title ?? '',
    declaredVerificationStatus: metadata['Verification Status'] ?? 'Not supplied',
    sha256: createHash('sha256').update(text).digest('hex'),
    pages,
  };
}

export async function loadRegulations() {
  // Reload on each call for now so source corrections take effect immediately.
  return parseRegulations(await readFile(corpusPath, 'utf8'));
}

export { buildRegulationContext } from './regulation-context.js';
