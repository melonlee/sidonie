// Pure helpers that turn positioned PDF text into readable sections and paragraphs.
// Kept free of pdf.js so they can be unit-tested; see pdfText.ts for the extraction itself.
import type { DocSection } from './types';

/** A text run as reported by pdf.js (coordinates in PDF space: y grows upwards). */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
  rotated?: boolean;
}

export interface PdfLine {
  text: string;
  x: number;
  y: number;
  right: number;
  fontSize: number;
  page: number;
}

/** Group a page's items (in content-stream order, which keeps two-column layouts in reading order) into lines. */
export function buildLines(items: PdfItem[], page: number): PdfLine[] {
  const lines: PdfLine[] = [];
  let cur: PdfLine | null = null;
  let breakNext = false;

  for (const it of items) {
    if (it.rotated) continue; // e.g. the vertical arXiv stamp in the margin
    const fs = it.fontSize || 10;
    const sameLine = cur && !breakNext && Math.abs(it.y - cur.y) < Math.max(fs, cur.fontSize) * 0.5 && it.x >= cur.x - fs;
    if (!sameLine) {
      if (cur && cur.text.trim()) lines.push(cur);
      cur = { text: '', x: it.x, y: it.y, right: it.x, fontSize: 0, page };
    }
    const line = cur!;
    if (it.str) {
      const gap = it.x - line.right;
      const needsSpace = line.text && !/\s$/.test(line.text) && !/^\s/.test(it.str) && gap > fs * 0.15;
      line.text += (needsSpace ? ' ' : '') + it.str;
      line.right = Math.max(line.right, it.x + it.width);
      // the dominant (largest non-trivial) font on the line
      if (it.str.trim()) line.fontSize = Math.max(line.fontSize, fs);
    }
    breakNext = it.hasEOL;
  }
  if (cur && cur.text.trim()) lines.push(cur);
  return lines.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim(), fontSize: l.fontSize || 10 }));
}

const HEADING_WORDS =
  /^(abstract|introduction|related work|related works|background|preliminaries|method|methods|methodology|approach|our approach|model architecture|experiments?|experimental setup|experimental results|evaluation|results|discussion|analysis|conclusions?|conclusion and future work|limitations|future work|references|bibliography|acknowledge?ments?|appendix|appendices)$/i;
const NUMBERED_HEADING = /^((\d+(\.\d+){0,3})|[IVX]{1,5}|[A-H])\.?\s+([A-Z][^]{1,90})$/;
const REFERENCES = /^(\d+\.?\s+)?(references|bibliography)$/i;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Most common font size, weighted by text length — the body text size. */
export function bodyFontSize(lines: PdfLine[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) {
    const k = Math.round(l.fontSize * 2) / 2;
    weight.set(k, (weight.get(k) || 0) + l.text.length);
  }
  let best = 10, bestW = -1;
  for (const [k, w] of weight) if (w > bestW) { best = k; bestW = w; }
  return best;
}

const isNoise = (text: string) =>
  !text ||
  /^\d{1,4}$/.test(text) || // page numbers
  /^arXiv:\d{4}\.\d{4,5}(v\d+)?\b/.test(text) ||
  /^page \d+( of \d+)?$/i.test(text);

export function isHeading(line: PdfLine, body: number): boolean {
  const text = line.text.trim();
  if (text.length > 100 || text.length < 3 || /[.,;]$/.test(text) && !/^\d+(\.\d+)*\.$/.test(text)) return false;
  const stripped = text.replace(/^((\d+(\.\d+){0,3})|[IVX]{1,5}|[A-H])\.?\s+/, '');
  if (HEADING_WORDS.test(stripped)) return true;
  const words = stripped.split(/\s+/).length;
  const bigger = line.fontSize >= body * 1.08;
  if (NUMBERED_HEADING.test(text) && bigger && words <= 12) return true;
  // Body-size sub-headings ("3.2 Multi-Head Attention", usually bold): dotted number, short, no digits in the title
  if (/^\d+\.\d+(\.\d+)?\.?\s+[A-Z]/.test(text) && words <= 10 && !/\d/.test(stripped) && Math.abs(line.fontSize - body) < 1) return true;
  // Larger-font headings without numbers (e.g. the paper title). Figure labels like "Layer5" are excluded.
  return line.fontSize >= body * 1.2 && /[A-Za-z]{3}/.test(text) && text.split(/\s+/).length >= 2 && text.split(/\s+/).length <= 14
    && !/\d$/.test(text) && (text.match(/\d/g) || []).length <= 1;
}

/** Join wrapped lines, removing end-of-line hyphenation ("transfor-" + "mer" -> "transformer"). */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (!out) out = l;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out;
}

/** Split very long paragraphs (failed layout detection, dense prose) at sentence boundaries. */
export function splitLongParagraph(text: string, max = 1400): string[] {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max * 0.65) { out.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Turn lines from all pages into sections of paragraphs. */
export function linesToSections(allLines: PdfLine[]): DocSection[] {
  const lines = allLines.filter(l => !isNoise(l.text.trim()));
  if (!lines.length) return [];
  const body = bodyFontSize(lines);
  const bodyLines = lines.filter(l => Math.abs(l.fontSize - body) < 0.6);
  // typical line spacing and full line width of body text
  const gaps: number[] = [];
  for (let i = 1; i < bodyLines.length; i++) {
    const g = bodyLines[i - 1].y - bodyLines[i].y;
    if (bodyLines[i].page === bodyLines[i - 1].page && g > 0 && g < body * 3) gaps.push(g);
  }
  const lineGap = median(gaps) || body * 1.2;
  const fullWidth = median(bodyLines.map(l => l.right - l.x)) || 300;

  type Draft = { title: string; paras: string[][] };
  const drafts: Draft[] = [{ title: '', paras: [[]] }];
  let prev: PdfLine | null = null;

  for (const line of lines) {
    const sec = drafts[drafts.length - 1];
    if (isHeading(line, body)) {
      drafts.push({ title: line.text.trim(), paras: [[]] });
      prev = null;
      continue;
    }
    let newPara = false;
    if (prev) {
      const gap = prev.y - line.y;
      const samePage = prev.page === line.page;
      const prevEndsSentence = /[.!?:]["')\]]?$/.test(prev.text);
      const prevShort = prev.right - prev.x < fullWidth * 0.8;
      const indented = line.x - prev.x > body * 0.6 && line.x - prev.x < body * 4;
      if (samePage && gap > lineGap * 1.45 && gap < body * 8) newPara = true; // extra vertical space
      else if (prevEndsSentence && (indented || prevShort)) newPara = true; // indent / short last line
      if (Math.abs(line.fontSize - prev.fontSize) > 1.5) newPara = true; // captions, footnotes
    }
    if (newPara && sec.paras[sec.paras.length - 1].length) sec.paras.push([]);
    sec.paras[sec.paras.length - 1].push(line.text);
    prev = line;
  }

  const sections: DocSection[] = [];
  drafts.forEach(d => {
    const texts: string[] = [];
    for (const p of d.paras) {
      const text = joinLines(p);
      if (!text) continue;
      // fold tiny fragments (equation pieces, labels) into the previous paragraph
      if (text.length < 30 && texts.length && !/[.!?]$/.test(text)) texts[texts.length - 1] += ' ' + text;
      else texts.push(...splitLongParagraph(text));
    }
    if (!texts.length) return; // heading directly followed by a sub-heading
    const i = sections.length;
    sections.push({
      id: `f-s${i}`,
      title: d.title,
      isReferences: REFERENCES.test(d.title) || undefined,
      paragraphs: texts.map((text, j) => ({ id: `f-s${i}-p${j}`, text })),
    });
  });
  return sections;
}

/** Plain text for a section list, e.g. for AI context. */
export const sectionsToText = (sections: DocSection[]) =>
  sections.map(s => `${s.title ? `## ${s.title}\n` : ''}${s.paragraphs.map(p => p.text).join('\n\n')}`).join('\n\n');
