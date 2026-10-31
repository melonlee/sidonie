import { describe, it, expect } from 'vitest';
import {
  cleanModelText, buildPaperContext, truncateText, parseNumberedBlocks, batchParagraphs,
  parseFlashcards, extractMarkdownSection, contextBudgetChars,
} from '../components/paper/paperAI';
import { buildReaderSections, segmentParagraph, buildExportNote, type ExportLabels } from '../components/paper/reader';
import type { DocSection, Highlight, SavedPaper } from '../components/paper/types';

const sec = (title: string, text: string, isReferences?: boolean): DocSection => ({
  id: title, title, isReferences, paragraphs: [{ id: `${title}-p0`, text }],
});

describe('cleanModelText', () => {
  it('strips complete and streaming <thought>/<plan> blocks', () => {
    expect(cleanModelText('<thought>hmm</thought>\n## TL;DR\nok')).toBe('## TL;DR\nok');
    expect(cleanModelText('<plan>- step')).toBe('');
    expect(cleanModelText('plain')).toBe('plain');
  });
});

describe('buildPaperContext', () => {
  it('keeps everything when it fits and drops references', () => {
    const ctx = buildPaperContext([sec('Intro', 'short intro'), sec('References', 'refs', true)], 10_000);
    expect(ctx).toBe('## Intro\nshort intro');
  });

  it('keeps short sections whole and trims long ones to the budget', () => {
    const long = 'Long sentence here. '.repeat(500); // 10k chars
    const ctx = buildPaperContext([sec('Intro', 'tiny'), sec('Method', long), sec('Appendix', long)], 3000);
    expect(ctx.length).toBeLessThanOrEqual(3100);
    expect(ctx).toContain('## Intro\ntiny');
    // method is weighted 2x vs appendix
    const method = ctx.split('## Appendix')[0].length;
    const appendix = ctx.split('## Appendix')[1].length;
    expect(method).toBeGreaterThan(appendix * 1.5);
  });

  it('truncateText prefers sentence boundaries', () => {
    expect(truncateText('Alpha beta gamma. Delta epsilon.', 22)).toBe('Alpha beta gamma. …');
    expect(truncateText('short', 15)).toBe('short');
  });
});

describe('budget', () => {
  it('depends on the provider that will answer', () => {
    expect(contextBudgetChars({ gemini: 'k' })).toBeGreaterThan(100_000);
    expect(contextBudgetChars({ kimi: 'k' })).toBe(12_000);
    expect(contextBudgetChars({ deepseek: 'k' })).toBe(60_000);
  });
});

describe('translation parsing', () => {
  it('parses numbered blocks, including a partial last block', () => {
    const m = parseNumberedBlocks('[[1]]\n第一段。\n\n[[2]]\n第二段\n[[3]]');
    expect(m.get(1)).toBe('第一段。');
    expect(m.get(2)).toBe('第二段');
    expect(m.has(3)).toBe(false);
  });

  it('batches paragraphs by size', () => {
    const paras = [{ text: 'a'.repeat(3000) }, { text: 'b'.repeat(3000) }, { text: 'c'.repeat(100) }];
    expect(batchParagraphs(paras, 5000).map(b => b.length)).toEqual([1, 2]);
  });
});

describe('parseFlashcards', () => {
  it('reads a fenced JSON array and ignores invalid items', () => {
    const text = 'Here you go:\n```json\n[{"term":"Self-attention","explanation":"Relates positions.","where":"§3.2"},{"term":""},{"explanation":"x"}]\n```';
    expect(parseFlashcards(text)).toEqual([{ term: 'Self-attention', explanation: 'Relates positions.', where: '§3.2' }]);
  });
  it('returns [] for non-JSON', () => {
    expect(parseFlashcards('sorry, no')).toEqual([]);
    expect(parseFlashcards('[not json]')).toEqual([]);
  });
});

describe('extractMarkdownSection', () => {
  it('returns the body under a heading', () => {
    const md = '## TL;DR\nA new model.\n\n## Method\nAttention.';
    expect(extractMarkdownSection(md, /TL;?DR/)).toBe('A new model.');
    expect(extractMarkdownSection(md, /Results/)).toBe('');
  });
});

const hl = (id: string, start: number, end: number, text: string, createdAt = 1): Highlight => ({
  id, paraId: 'p', start, end, text, color: 'yellow', createdAt,
});

describe('segmentParagraph', () => {
  const text = 'Attention is all you need.';
  it('splits text around highlights', () => {
    const segs = segmentParagraph(text, [hl('h1', 0, 9, 'Attention')]);
    expect(segs.map(s => [s.text, s.highlight?.id])).toEqual([['Attention', 'h1'], [' is all you need.', undefined]]);
  });
  it('resolves overlaps to the newest highlight and relocates drifted offsets', () => {
    const segs = segmentParagraph(text, [hl('old', 0, 16, 'Attention is all', 1), hl('new', 13, 20, 'all you', 2)]);
    expect(segs.map(s => [s.text, s.highlight?.id])).toEqual([['Attention is ', 'old'], ['all you', 'new'], [' need.', undefined]]);
    expect(segmentParagraph(text, [hl('moved', 3, 7, 'need')])[1]).toMatchObject({ text: 'need', start: 21 });
    expect(segmentParagraph(text, [hl('gone', 0, 4, 'zzz')])).toEqual([{ text, start: 0 }]);
  });
});

describe('reader & export', () => {
  const paper: SavedPaper = {
    id: '1706.03762', source: 'arxiv', title: 'Attention Is All You Need', authors: ['Ashish Vaswani', 'Noam Shazeer'],
    summary: 'First abstract paragraph.\n\nSecond.', publishedAt: '2017-06-12T00:00:00Z', category: 'cs.CL',
    status: 'read', tags: ['transformers'], addedAt: 0, notes: 'My takeaway.',
    highlights: [
      { ...hl('h2', 0, 6, 'Second', 2), paraId: 'a-p1', note: 'why?', sectionTitle: 'Abstract' },
      { ...hl('h1', 0, 5, 'First', 1), paraId: 'a-p0', sectionTitle: 'Abstract' },
    ],
  };

  it('puts the metadata abstract first and skips the extracted abstract', () => {
    const doc = { sections: [sec('Attention Is All You Need', 'Ashish Vaswani'), sec('Abstract', 'dup'), sec('1 Introduction', 'intro')], pageCount: 1, source: 'arxiv' as const, extractedAt: 0 };
    const s = buildReaderSections(paper, doc, '摘要');
    expect(s.map(x => x.title)).toEqual(['摘要', '1 Introduction']);
    expect(s[0].paragraphs.map(p => p.id)).toEqual(['a-p0', 'a-p1']);
  });

  it('builds a Notes export with metadata, TL;DR, ordered highlights, notes and citation', () => {
    const labels: ExportLabels = { authors: 'Authors', published: 'Published', status: 'Status', tags: 'Tags', link: 'Link', tldr: 'TL;DR', highlights: 'Highlights', note: 'Note', myNotes: 'My notes', citation: 'Citation' };
    const md = buildExportNote(paper, { statusLabel: 'Read', analysis: '## TL;DR\nTransformers replace recurrence.\n## Method\n...', labels, sectionOrder: ['a-p0', 'a-p1'] });
    expect(md).toContain('# Attention Is All You Need');
    expect(md).toContain('**Authors:** Ashish Vaswani, Noam Shazeer');
    expect(md).toContain('arXiv:1706.03762');
    expect(md).toContain('## TL;DR\nTransformers replace recurrence.');
    expect(md.indexOf('> First')).toBeLessThan(md.indexOf('> Second'));
    expect(md).toContain('**Note:** why?');
    expect(md).toContain('## My notes\nMy takeaway.');
    expect(md).toContain('@misc{vaswani2017attention');
  });
});
