export function buildRegulationContext(corpus) {
  // Include every operative page; preserve tables and cross-page continuations.
  // The model instructions and user's question will be added separately in step 3.
  return JSON.stringify({
    sourceId: corpus.sourceId,
    corpusVersion: corpus.version,
    sourceHash: corpus.sha256,
    pages: corpus.pages.filter(page => ['regulation', 'general'].includes(page.kind)).map(page => ({
      citationId: page.id,
      kind: page.kind,
      sourceId: page.sourceId ?? corpus.sourceId,
      sourceVersion: page.sourceVersion ?? corpus.version,
      ...(page.kind === 'general' ? { title: page.title, verification: page.verification, caution: page.caution, collectedDate: page.collectedDate } : {}),
      pdfPage: page.pdfPage,
      printedPage: page.printedPage,
      indexedSections: page.sections,
      text: page.text,
    })),
  });
}
