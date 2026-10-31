import { describe, it, expect } from 'vitest';
import { buildLines, linesToSections, joinLines, splitLongParagraph, isHeading, type PdfItem, type PdfLine } from '../components/paper/textSections';

// Helper: a line of body text at (x, y) on a page
const L = (text: string, y: number, opts: Partial<PdfLine> = {}): PdfLine => ({
  text, x: 72, y, right: 72 + (opts.right ?? 460), fontSize: 10, page: 1, ...opts,
});

describe('buildLines', () => {
  it('joins items on the same baseline, breaks on EOL and skips rotated stamps', () => {
    const items: PdfItem[] = [
      { str: 'arXiv:1706.03762v7 [cs.CL]', x: 10, y: 300, width: 200, fontSize: 20, hasEOL: true, rotated: true },
      { str: 'Attention', x: 72, y: 700, width: 40, fontSize: 10, hasEOL: false },
      { str: 'is all', x: 114, y: 700, width: 25, fontSize: 10, hasEOL: false },
      { str: 'you need', x: 141, y: 700, width: 35, fontSize: 10, hasEOL: true },
      { str: 'Next line', x: 72, y: 688, width: 40, fontSize: 10, hasEOL: false },
    ];
    const lines = buildLines(items, 1);
    expect(lines.map(l => l.text)).toEqual(['Attention is all you need', 'Next line']);
    expect(lines[0].right).toBe(176);
  });
});

describe('joinLines', () => {
  it('removes end-of-line hyphenation but keeps real hyphens', () => {
    expect(joinLines(['the transfor-', 'mer model uses self-', 'Attention'])).toBe('the transformer model uses self- Attention');
  });
});

describe('splitLongParagraph', () => {
  it('splits at sentence boundaries', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const parts = splitLongParagraph(text, 300);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every(p => p.length <= 300)).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });
});

describe('isHeading', () => {
  it('recognises numbered and known headings but not sentences', () => {
    expect(isHeading(L('1 Introduction', 0, { fontSize: 12 }), 10)).toBe(true);
    expect(isHeading(L('3.2 Multi-Head Attention', 0, { fontSize: 11 }), 10)).toBe(true);
    expect(isHeading(L('References', 0), 10)).toBe(true);
    expect(isHeading(L('Abstract', 0), 10)).toBe(true);
    expect(isHeading(L('1. We propose a new model that is simple.', 0), 10)).toBe(false);
    expect(isHeading(L('This is a normal body line', 0), 10)).toBe(false);
  });
});

describe('linesToSections', () => {
  it('builds sections and paragraphs from spacing, indentation and headings', () => {
    const lines: PdfLine[] = [
      L('Attention Is All You Need', 760, { fontSize: 17 }),
      L('Ashish Vaswani Noam Shazeer', 730),
      L('Abstract', 700, { fontSize: 12 }),
      L('The dominant sequence transduction models are based on complex recurrent', 686),
      L('networks. We propose a new simple network architecture.', 674, { right: 250 }),
      L('1 Introduction', 640, { fontSize: 12 }),
      L('Recurrent neural networks have been firmly established as state of the', 626),
      L('art approaches in sequence modeling and transduction problems.', 614, { right: 300 }),
      L('Attention mechanisms have become an integral part of compelling sequence', 602, { x: 84 }),
      L('modeling in various tasks.', 590, { right: 200 }),
      L('7', 40), // page number
      L('References', 560, { fontSize: 12 }),
      L('[1] Jimmy Lei Ba, Jamie Ryan Kiros. Layer normalization. 2016.', 546),
    ];
    const sections = linesToSections(lines);
    expect(sections.map(s => s.title)).toEqual(['Attention Is All You Need', 'Abstract', '1 Introduction', 'References']);
    expect(sections[1].paragraphs).toHaveLength(1);
    expect(sections[1].paragraphs[0].text).toBe(
      'The dominant sequence transduction models are based on complex recurrent networks. We propose a new simple network architecture.',
    );
    // indentation starts a new paragraph
    expect(sections[2].paragraphs.map(p => p.text.slice(0, 20))).toEqual(['Recurrent neural net', 'Attention mechanisms']);
    expect(sections[2].paragraphs[1].id).toBe('f-s2-p1');
    expect(sections[3].isReferences).toBe(true);
    // page numbers are dropped
    expect(sections.flatMap(s => s.paragraphs).some(p => p.text === '7')).toBe(false);
  });

  it('starts a new paragraph after extra vertical space', () => {
    const lines = [
      L('First paragraph line one continues here and keeps going on and on', 700),
      L('and continues without a short line marker at all, really long', 688),
      L('and continues without a short line marker at all, really long', 676),
      L('and ends here without a short line marker at all, really long', 664),
      L('Second paragraph starts after a gap and goes on for a while longer', 636),
    ];
    const [s] = linesToSections(lines);
    expect(s.paragraphs).toHaveLength(2);
  });

  it('returns nothing for empty input', () => {
    expect(linesToSections([])).toEqual([]);
  });
});
