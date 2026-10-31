import type { Paper } from '../../types';

// --- arXiv access ---
// The arXiv API doesn't send CORS headers, so browsers can't call it directly.
// Sources are tried in order; the first that works is remembered for the session.
//  1. same-origin proxy served by `npm run dev` / `npm run preview` (vite.config.ts)
//  2. direct request (works if arXiv enables CORS — arxiv.org/pdf currently does)
//  3. your own proxy, if built with VITE_ARXIV_PROXY (prefix; the arXiv URL is appended encoded)
//  4. public fallback: api.allorigins.win — a third-party service that sees the requested URL
export type ArxivSourceId = 'local' | 'direct' | 'custom' | 'public';
type Source = { id: ArxivSourceId; build: (target: string) => string; timeoutMs: number };

const ARXIV_API = 'https://export.arxiv.org/api/query';
const ARXIV_PDF = 'https://arxiv.org/pdf/';
const PUBLIC_PROXY = 'https://api.allorigins.win/raw?url=';
const CUSTOM_PROXY = import.meta.env.VITE_ARXIV_PROXY as string | undefined;
const BASE = import.meta.env.BASE_URL;

const makeSources = (local: (t: string) => string, remote: (t: string) => string, slow: number): Source[] => [
  { id: 'local', build: local, timeoutMs: slow },
  { id: 'direct', build: remote, timeoutMs: 12000 },
  ...(CUSTOM_PROXY ? [{ id: 'custom' as const, build: (t: string) => `${CUSTOM_PROXY}${encodeURIComponent(remote(t))}`, timeoutMs: slow }] : []),
  { id: 'public', build: (t: string) => `${PUBLIC_PROXY}${encodeURIComponent(remote(t))}`, timeoutMs: slow },
];

const FEED_SOURCES = makeSources(qs => `${BASE}arxiv-api/query?${qs}`, qs => `${ARXIV_API}?${qs}`, 20000);
const PDF_SOURCES = makeSources(id => `${BASE}arxiv-pdf/${id}`, id => `${ARXIV_PDF}${id}`, 45000);

const preferred: { feed: ArxivSourceId | null; pdf: ArxivSourceId | null } = { feed: null, pdf: null };
const ordered = (sources: Source[], pref: ArxivSourceId | null) =>
  pref ? [...sources.filter(s => s.id === pref), ...sources.filter(s => s.id !== pref)] : sources;

export const fetchArxivFeed = async (qs: string): Promise<{ xml: string; source: ArxivSourceId }> => {
  for (const source of ordered(FEED_SOURCES, preferred.feed)) {
    try {
      const res = await fetch(source.build(qs), { signal: AbortSignal.timeout(source.timeoutMs) });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes('<feed')) continue; // e.g. an HTML 404 page from a static host
      preferred.feed = source.id;
      return { xml, source: source.id };
    } catch (e) {
      console.warn(`arXiv source "${source.id}" failed`, e);
    }
  }
  throw new Error('All arXiv sources failed');
};

/** Download an arXiv PDF through the same source chain. Validates the `%PDF` magic bytes. */
export const fetchArxivPdf = async (id: string): Promise<{ data: ArrayBuffer; source: ArxivSourceId }> => {
  for (const source of ordered(PDF_SOURCES, preferred.pdf)) {
    try {
      const res = await fetch(source.build(id), { signal: AbortSignal.timeout(source.timeoutMs) });
      if (!res.ok) continue;
      const data = await res.arrayBuffer();
      const head = new TextDecoder().decode(new Uint8Array(data.slice(0, 5)));
      if (head !== '%PDF-') continue;
      preferred.pdf = source.id;
      return { data, source: source.id };
    } catch (e) {
      console.warn(`arXiv PDF source "${source.id}" failed`, e);
    }
  }
  throw new Error('Could not download the PDF');
};

// Free-text searches become a phrase match across all fields. Without this, arXiv treats
// "spaced repetition" loosely and the newest-first sort surfaces unrelated papers.
// Queries that already use arXiv syntax (e.g. `cat:cs.CL`, `ti:agent`) are passed through.
export const toArxivQuery = (input: string) => {
  const q = input.trim();
  if (/\b[a-z]{2,4}:/i.test(q) || /\b(AND|OR|ANDNOT)\b/.test(q)) return q;
  return `all:"${q.replace(/"/g, '')}"`;
};

/**
 * Parse an arXiv identifier from user input: bare ids ("1706.03762v7", "arXiv:1706.03762"),
 * old-style ids ("hep-th/9901001", "math.GT/0309136") or abs/pdf URLs.
 */
export const parseArxivId = (input: string): { id: string; version?: string } | null => {
  const s = input.trim().replace(/^arxiv:\s*/i, '');
  const m =
    s.match(/(?:^|arxiv\.org\/(?:abs|pdf|html)\/)(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?(?:[?#/].*)?$/i) ||
    s.match(/(?:^|arxiv\.org\/(?:abs|pdf)\/)([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?(?:\.pdf)?(?:[?#].*)?$/i);
  if (!m) return null;
  return { id: m[1], version: m[2] };
};

/** Parse an Atom feed from the arXiv API into papers (browser only: uses DOMParser). */
export const parseArxivFeed = (xml: string, offset = 0): Paper[] => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const entries = Array.from(doc.getElementsByTagName('entry'));
  return entries.map((entry, i) => {
    const text = (tag: string) => entry.getElementsByTagName(tag)[0]?.textContent || '';
    const absUrl = text('id');
    const parsed = parseArxivId(absUrl);
    const published = text('published');

    let link = '';
    let pdfLink = '';
    for (const l of Array.from(entry.getElementsByTagName('link'))) {
      const href = l.getAttribute('href') || '';
      if (l.getAttribute('rel') === 'alternate') link = href;
      if (l.getAttribute('title') === 'pdf' || href.includes('/pdf/')) pdfLink = href;
    }

    return {
      id: parsed ? `${parsed.id}${parsed.version || ''}` : `paper-${offset}-${i}`,
      title: text('title').replace(/\s+/g, ' ').trim() || 'Untitled',
      summary: text('summary').replace(/\s+/g, ' ').trim(),
      authors: Array.from(entry.getElementsByTagName('author')).map(a => a.getElementsByTagName('name')[0]?.textContent || 'Unknown'),
      published: published ? new Date(published).toLocaleDateString() : '',
      publishedAt: published || undefined,
      link,
      pdfLink,
      category: entry.getElementsByTagName('arxiv:primary_category')[0]?.getAttribute('term')
        || entry.getElementsByTagName('category')[0]?.getAttribute('term')
        || 'General',
    };
  });
};

/** Look up a single paper by arXiv id. */
export const fetchArxivPaperById = async (id: string): Promise<Paper | null> => {
  const { xml } = await fetchArxivFeed(`id_list=${encodeURIComponent(id)}&max_results=1`);
  const [paper] = parseArxivFeed(xml);
  // The API answers unknown ids with an "Error" entry
  if (!paper || /^error$/i.test(paper.title) || !parseArxivId(paper.id)) return null;
  return paper;
};
