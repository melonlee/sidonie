import { describe, it, expect } from 'vitest';
import { Bm25Index, chunkSections, tokenize } from '../components/paper/bm25';
import type { DocSection } from '../components/paper/types';

const sec = (id: string, title: string, paras: string[], isReferences?: boolean): DocSection => ({
  id, title, isReferences, paragraphs: paras.map((text, i) => ({ id: `${id}-p${i}`, text })),
});

const sections: DocSection[] = [
  sec('s0', 'Abstract', ['We propose the Transformer, a model architecture based solely on attention mechanisms.']),
  sec('s1', '3.2 Multi-Head Attention', ['Multi-head attention allows the model to jointly attend to information from different representation subspaces.']),
  sec('s2', '5.4 Regularization', ['We apply dropout to the output of each sub-layer. Label smoothing hurts perplexity but improves BLEU.']),
  sec('s3', '6 Results', ['On the WMT 2014 English-to-German translation task, the big model achieves 28.4 BLEU.']),
  sec('s4', '附录', ['我们使用了标签平滑和残差连接。']),
  sec('s5', 'References', ['[1] Attention attention attention BLEU BLEU dropout.'], true),
];

describe('tokenize', () => {
  it('lowercases, drops stopwords, stems plurals and makes CJK bigrams', () => {
    expect(tokenize('The Mechanisms of Attention')).toEqual(['mechanism', 'attention']);
    expect(tokenize('标签平滑')).toEqual(['标签', '签平', '平滑']);
    expect(tokenize('BLEU 分数')).toEqual(['分数', 'bleu']);
  });
});

describe('chunkSections', () => {
  it('skips references and keeps section titles and paragraph ids', () => {
    const chunks = chunkSections(sections);
    expect(chunks).toHaveLength(5);
    expect(chunks[1]).toMatchObject({ sectionTitle: '3.2 Multi-Head Attention', paraIds: ['s1-p0'] });
  });

  it('merges small paragraphs up to the target size', () => {
    const many = sec('m', 'Method', Array.from({ length: 10 }, (_, i) => `Paragraph ${i} `.repeat(10)));
    const chunks = chunkSections([many], 400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThan(10);
    expect(chunks.flatMap(c => c.paraIds)).toHaveLength(10);
  });
});

describe('Bm25Index', () => {
  const index = new Bm25Index(chunkSections(sections));

  it('ranks the passage that answers the question first', () => {
    expect(index.search('What BLEU score does the big model achieve on WMT 2014?')[0].sectionTitle).toBe('6 Results');
    expect(index.search('how does multi-head attention work')[0].sectionTitle).toBe('3.2 Multi-Head Attention');
    expect(index.search('dropout regularization')[0].sectionTitle).toBe('5.4 Regularization');
  });

  it('matches Chinese queries against Chinese text', () => {
    expect(index.search('标签平滑有什么用')[0].sectionTitle).toBe('附录');
  });

  it('returns nothing when no term matches and respects k', () => {
    expect(index.search('quantum chromodynamics')).toEqual([]);
    expect(index.search('attention model', 2)).toHaveLength(2);
  });
});
