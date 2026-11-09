// Presentation only: preserve words/numbers and never interpret text as HTML.
export function formatAnswerBlocks(text) {
  const blocks = [];
  for (const paragraph of text.split(/\n\s*\n/u).filter(part => part.trim())) {
    let lines = paragraph.split('\n');
    // Older answers may have Burmese checklist markers in a single paragraph.
    const inlineMarkers = paragraph.match(/\([၀-၉0-9]+\)/gu) ?? [];
    if (lines.length === 1 && inlineMarkers.length >= 2) lines = paragraph.split(/\s+(?=\([၀-၉0-9]+\))/u);
    let list = null;
    for (const [lineIndex, line] of lines.entries()) {
      const match = line.match(/^\s*(?:(\([၀-၉0-9]+\)|[၀-၉0-9]+[.)။])|([-*]))\s+(.+)$/u);
      if (match) {
        const type = match[1] ? 'ordered' : 'unordered';
        if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
        list.items.push(match[3]);
      } else {
        list = null;
        if (line.trim()) {
          const previous = blocks.at(-1);
          if (previous?.type === 'paragraph' && lineIndex > 0) previous.text += `\n${line}`;
          else blocks.push({ type: 'paragraph', text: line });
        }
      }
    }
  }
  return blocks;
}
