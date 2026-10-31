// Pure helpers for the reading view: document assembly, highlight segments, Notes export.
import { formatCitation } from './citation';
import { extractMarkdownSection } from './paperAI';
import type { DocSection, ExtractedDoc, Highlight, SavedPaper } from './types';

const ABSTRACT_TITLE = /^(\d+\.?\s*)?abstract$/i;

/** Split an abstract or other plain text into paragraphs. */
export const splitParagraphs = (text: string) => text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

/**
 * Sections shown in the reader: the metadata abstract first (ids "a-p…", so highlights on it
 * survive loading the full text), then the extracted full text without its own abstract.
 */
export function buildReaderSections(paper: SavedPaper, doc: ExtractedDoc | null | undefined, abstractTitle = 'Abstract'): DocSection[] {
  const sections: DocSection[] = [];
  const abstractParas = splitParagraphs(paper.summary);
  if (abstractParas.length) {
    sections.push({ id: 'a', title: abstractTitle, paragraphs: abstractParas.map((text, i) => ({ id: `a-p${i}`, text })) });
  }
  for (const s of doc?.sections || []) {
    if (abstractParas.length && ABSTRACT_TITLE.test(s.title.trim())) continue;
    sections.push(s);
  }
  return sections;
}

export interface Segment { text: string; start: number; highlight?: Highlight }

/** Resolve where a highlight sits in a paragraph; relocate by text if offsets drifted, or null. */
export function locateHighlight(text: string, h: Highlight): { start: number; end: number } | null {
  if (text.slice(h.start, h.end) === h.text) return { start: h.start, end: h.end };
  const at = text.indexOf(h.text);
  return at >= 0 && h.text ? { start: at, end: at + h.text.length } : null;
}

/**
 * Split a paragraph into plain and highlighted segments. Overlaps resolve to the most
 * recently created highlight.
 */
export function segmentParagraph(text: string, highlights: Highlight[]): Segment[] {
  const placed = highlights
    .map(h => ({ h, pos: locateHighlight(text, h) }))
    .filter((x): x is { h: Highlight; pos: { start: number; end: number } } => !!x.pos && x.pos.end > x.pos.start);
  if (!placed.length) return [{ text, start: 0 }];
  const cuts = new Set<number>([0, text.length]);
  placed.forEach(({ pos }) => { cuts.add(pos.start); cuts.add(pos.end); });
  const points = [...cuts].sort((a, b) => a - b);
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const covering = placed.filter(({ pos }) => pos.start <= a && pos.end >= b).sort((x, y) => y.h.createdAt - x.h.createdAt)[0];
    const prev = segments[segments.length - 1];
    if (prev && prev.highlight?.id === covering?.h.id) prev.text += text.slice(a, b);
    else segments.push({ text: text.slice(a, b), start: a, highlight: covering?.h });
  }
  return segments;
}

export interface ExportLabels {
  authors: string; published: string; status: string; tags: string; link: string;
  tldr: string; highlights: string; note: string; myNotes: string; citation: string;
}

/** Markdown note for the Notes module: metadata, TL;DR, highlights with notes, my notes, citation. */
export function buildExportNote(paper: SavedPaper, opts: {
  statusLabel: string; analysis?: string; labels: ExportLabels; sectionOrder?: string[];
}): string {
  const { labels } = opts;
  const meta = [
    paper.authors.length ? `**${labels.authors}:** ${paper.authors.join(', ')}` : '',
    [paper.publishedAt ? `**${labels.published}:** ${paper.publishedAt.slice(0, 10)}` : '', paper.source === 'arxiv' ? `arXiv:${paper.id}` : '', paper.category || '']
      .filter(Boolean).join(' · '),
    `**${labels.status}:** ${opts.statusLabel}${paper.tags.length ? ` · **${labels.tags}:** ${paper.tags.join(', ')}` : ''}`,
    paper.source === 'arxiv' ? `**${labels.link}:** https://arxiv.org/abs/${paper.id}` : '',
  ].filter(Boolean);

  const out = [`# ${paper.title}`, '', meta.join('  \n')];
  const tldr = opts.analysis ? extractMarkdownSection(opts.analysis, /TL;?DR/i) : '';
  if (tldr) out.push('', `## ${labels.tldr}`, tldr);

  if (paper.highlights.length) {
    const order = opts.sectionOrder || [];
    const rank = (h: Highlight) => { const i = order.indexOf(h.paraId); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const sorted = [...paper.highlights].sort((a, b) => rank(a) - rank(b) || a.start - b.start);
    out.push('', `## ${labels.highlights}`);
    for (const h of sorted) {
      out.push('', `> ${h.text.replace(/\n+/g, ' ')}`);
      if (h.sectionTitle) out.push(`> — § ${h.sectionTitle}`);
      if (h.note) out.push('', `**${labels.note}:** ${h.note}`);
    }
  }
  if (paper.notes.trim()) out.push('', `## ${labels.myNotes}`, paper.notes.trim());
  out.push('', `## ${labels.citation}`, formatCitation(paper, 'apa'), '', '```bibtex', formatCitation(paper, 'bibtex'), '```');
  return out.join('\n');
}
