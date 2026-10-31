// Tiny in-browser BM25 retrieval over paper chunks — no embeddings server needed.
import type { DocSection } from './types';

export interface Chunk {
  id: string;
  sectionTitle: string;
  text: string;
  paraIds: string[];
}

const CJK_RUN = /[㐀-鿿぀-ヿ가-힯]+/g;
const STOPWORDS = new Set(
  ('a an and are as at be but by for from has have in into is it its of on or that the their this to was were which with we our ' +
    'can how what why when where who does do did not than then there these those also such using use used via per between each other more most ' +
    'paper about').split(' '),
);

/**
 * Lowercased word tokens for Latin text (light plural/-ing stemming) and character bigrams for
 * CJK text, so Chinese questions can still match Chinese passages.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const run of lower.match(CJK_RUN) || []) {
    if (run.length === 1) tokens.push(run);
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  for (const w of lower.replace(CJK_RUN, ' ').split(/[^a-z0-9]+/)) {
    if (!w || STOPWORDS.has(w) || (w.length < 2 && !/\d/.test(w))) continue;
    tokens.push(stem(w));
  }
  return tokens;
}

const stem = (w: string) => {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('es') && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** Merge consecutive paragraphs of a section into chunks of roughly `target` characters. */
export function chunkSections(sections: DocSection[], target = 900): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (s.isReferences) continue;
    let text = '';
    let ids: string[] = [];
    const flush = () => {
      if (text.trim()) chunks.push({ id: `c${chunks.length}`, sectionTitle: s.title, text: text.trim(), paraIds: ids });
      text = '';
      ids = [];
    };
    for (const p of s.paragraphs) {
      if (text && text.length + p.text.length > target) flush();
      text += (text ? '\n\n' : '') + p.text;
      ids.push(p.id);
    }
    flush();
  }
  return chunks;
}

export interface ScoredChunk extends Chunk { score: number }

export class Bm25Index {
  private docs: { chunk: Chunk; tf: Map<string, number>; len: number }[];
  private df = new Map<string, number>();
  private avgLen: number;

  constructor(chunks: Chunk[], private k1 = 1.4, private b = 0.75) {
    this.docs = chunks.map(chunk => {
      const tokens = tokenize(`${chunk.sectionTitle} ${chunk.text}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      return { chunk, tf, len: tokens.length };
    });
    this.avgLen = this.docs.reduce((n, d) => n + d.len, 0) / (this.docs.length || 1);
  }

  search(query: string, k = 5): ScoredChunk[] {
    const terms = [...new Set(tokenize(query))];
    const N = this.docs.length;
    const scored = this.docs.map(d => {
      let score = 0;
      for (const term of terms) {
        const f = d.tf.get(term);
        if (!f) continue;
        const df = this.df.get(term) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / (this.avgLen || 1))));
      }
      return { ...d.chunk, score };
    });
    return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  }
}
