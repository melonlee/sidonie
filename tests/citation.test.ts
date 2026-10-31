import { describe, it, expect } from 'vitest';
import { parseName, sentenceCase, toBibtex, toApa, toGbt7714, bibtexKey, type CitablePaper } from '../components/paper/citation';

const attention: CitablePaper = {
  id: '1706.03762',
  source: 'arxiv',
  title: 'Attention Is All You Need',
  authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar', 'Jakob Uszkoreit', 'Llion Jones', 'Aidan N. Gomez', 'Lukasz Kaiser', 'Illia Polosukhin'],
  publishedAt: '2017-06-12T17:57:34Z',
  category: 'cs.CL',
  link: 'http://arxiv.org/abs/1706.03762v7',
};

describe('parseName', () => {
  it('handles given-family, comma form, particles and CJK names', () => {
    expect(parseName('Aidan N. Gomez')).toEqual({ given: ['Aidan', 'N.'], family: 'Gomez' });
    expect(parseName('Vaswani, Ashish')).toEqual({ given: ['Ashish'], family: 'Vaswani' });
    expect(parseName('Ludwig van Beethoven')).toEqual({ given: ['Ludwig'], family: 'van Beethoven' });
    expect(parseName('李辉')).toEqual({ given: ['辉'], family: '李' });
    expect(parseName('Plato')).toEqual({ given: [], family: 'Plato' });
  });
});

describe('sentenceCase', () => {
  it('lowercases ordinary words but keeps acronyms and technical names', () => {
    expect(sentenceCase('Attention Is All You Need')).toBe('Attention is all you need');
    expect(sentenceCase('BERT: Pre-training of Deep Bidirectional Transformers')).toBe('BERT: Pre-training of deep bidirectional transformers');
    expect(sentenceCase('Scaling LLMs with GPT-4 on ImageNet')).toBe('Scaling LLMs with GPT-4 on ImageNet');
  });
});

describe('BibTeX', () => {
  it('produces a standard arXiv @misc entry', () => {
    expect(bibtexKey(attention)).toBe('vaswani2017attention');
    const bib = toBibtex(attention);
    expect(bib).toContain('@misc{vaswani2017attention,');
    expect(bib).toContain('title = {Attention Is All You Need}');
    expect(bib).toContain('author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki');
    expect(bib).toContain('Gomez, Aidan N.');
    expect(bib).toContain('year = {2017}');
    expect(bib).toContain('eprint = {1706.03762}');
    expect(bib).toContain('archivePrefix = {arXiv}');
    expect(bib).toContain('primaryClass = {cs.CL}');
    expect(bib).toContain('url = {https://arxiv.org/abs/1706.03762}');
    expect(bib.trim().endsWith('}')).toBe(true);
  });

  it('escapes special characters', () => {
    expect(toBibtex({ ...attention, title: 'Q&A at 100% scale' })).toContain('Q\\&A at 100\\% scale');
  });
});

describe('APA 7', () => {
  it('formats authors, year, sentence-case title and the arXiv DOI', () => {
    expect(toApa(attention)).toBe(
      'Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). ' +
      'Attention is all you need. arXiv. https://doi.org/10.48550/arXiv.1706.03762',
    );
  });

  it('uses the 19 … last rule for more than 20 authors', () => {
    const many = { ...attention, authors: Array.from({ length: 25 }, (_, i) => `Given${i} Family${i}`) };
    const apa = toApa(many);
    expect(apa).toContain('Family18, G., . . . Family24, G.');
    expect(apa).not.toContain('Family19');
  });

  it('handles a single author and local papers without date', () => {
    const local: CitablePaper = { id: 'local-1', source: 'local', title: 'My Notes', authors: ['Jane Doe'] };
    expect(toApa(local)).toBe('Doe, J. (n.d.). My notes.');
  });
});

describe('GB/T 7714', () => {
  it('lists three authors then et al., upper-case surnames, [EB/OL] and dates', () => {
    expect(toGbt7714(attention, new Date('2026-11-01T00:00:00Z'))).toBe(
      'VASWANI A, SHAZEER N, PARMAR N, et al. Attention Is All You Need[EB/OL]. arXiv:1706.03762. (2017-06-12)[2026-11-01]. https://arxiv.org/abs/1706.03762.',
    );
  });

  it('uses 等 for Chinese author lists', () => {
    const zh: CitablePaper = { id: 'local-2', source: 'local', title: '大模型综述', authors: ['张三', '李四', '王五', '赵六'], publishedAt: '2024-01-02' };
    expect(toGbt7714(zh, new Date('2026-11-01T00:00:00Z'))).toBe('张三, 李四, 王五, 等. 大模型综述[EB/OL]. (2024-01-02)[2026-11-01].');
  });
});
