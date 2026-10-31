// Citation formatting for reading-list papers: BibTeX, APA 7, GB/T 7714-2015.

export interface CitablePaper {
  id: string; // arXiv id without version, or a local id
  source: 'arxiv' | 'local';
  title: string;
  authors: string[];
  publishedAt?: string; // ISO
  category?: string;
  link?: string;
}

export interface PersonName { given: string[]; family: string }

const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'dos', 'das', 'ter', 'bin', 'al']);
const SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv)$/i;
const CJK = /[㐀-鿿]/;

/** Split "Ashish Vaswani", "Vaswani, Ashish", "Ludwig van Beethoven" into given/family names. */
export function parseName(raw: string): PersonName {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { given: [], family: '' };
  if (name.includes(',')) {
    const [family, given] = name.split(',', 2).map(s => s.trim());
    return { family, given: given ? given.split(' ').filter(Boolean) : [] };
  }
  // Chinese names written without spaces: family name is the first character
  if (CJK.test(name) && !name.includes(' ')) return { family: name.slice(0, 1), given: name.length > 1 ? [name.slice(1)] : [] };
  const parts = name.split(' ').filter(p => !SUFFIXES.test(p));
  if (parts.length === 1) return { family: parts[0], given: [] };
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return { given: parts.slice(0, i), family: parts.slice(i).join(' ') };
}

/** "Jean-Luc" -> "J.-L.", "Ashish" -> "A." */
const initial = (given: string) =>
  given.split('-').map(g => (g.replace(/\./g, '')[0] || '').toUpperCase() + '.').join('-');

export const yearOf = (p: CitablePaper) => {
  const d = p.publishedAt ? new Date(p.publishedAt) : null;
  return d && !Number.isNaN(d.getTime()) ? String(d.getUTCFullYear()) : 'n.d.';
};

const isoDate = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

// arXiv papers cite the canonical, version-less abstract page
export const paperUrl = (p: CitablePaper) => (p.source === 'arxiv' ? `https://arxiv.org/abs/${p.id}` : p.link || '');

const tidyTitle = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/[.。]$/, '');

/**
 * APA titles use sentence case. Words that look like acronyms or proper technical names
 * (BERT, GPT-4, ImageNet, LLMs) keep their capitalization.
 */
export function sentenceCase(title: string): string {
  let capitalizeNext = true;
  return tidyTitle(title).split(/(\s+)/).map(tok => {
    if (/^\s+$/.test(tok)) return tok;
    const word = tok;
    const core = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    let out = word;
    const keep = !core || /[A-Z].*[A-Z]/.test(core) || /\d/.test(word) || /[a-z][A-Z]/.test(core);
    if (capitalizeNext) out = word.replace(/[A-Za-z]/, c => c.toUpperCase());
    else if (!keep) out = word.toLowerCase();
    capitalizeNext = /[:?!]$/.test(word);
    return out;
  }).join('');
}

const bibEscape = (s: string) => s.replace(/([&%$#_])/g, '\\$1');

export function bibtexKey(p: CitablePaper): string {
  const fam = parseName(p.authors[0] || '').family || 'anon';
  const ascii = (s: string) => s.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const stop = new Set(['a', 'an', 'the', 'on', 'of', 'for', 'in', 'to', 'and', 'with', 'is', 'are', 'towards', 'toward']);
  const word = p.title.split(/\s+/).map(ascii).find(w => w && !stop.has(w)) || 'paper';
  const year = yearOf(p);
  return `${ascii(fam) || 'anon'}${year === 'n.d.' ? '' : year}${word}`;
}

export function toBibtex(p: CitablePaper): string {
  const authors = p.authors.map(a => {
    const n = parseName(a);
    return n.given.length ? `${n.family}, ${n.given.join(' ')}` : n.family;
  }).join(' and ');
  const fields: [string, string][] = [
    ['title', `{${bibEscape(tidyTitle(p.title))}}`],
    ['author', `{${bibEscape(authors)}}`],
    ['year', `{${yearOf(p) === 'n.d.' ? '' : yearOf(p)}}`],
  ];
  if (p.source === 'arxiv') {
    fields.push(['eprint', `{${p.id}}`], ['archivePrefix', '{arXiv}']);
    if (p.category) fields.push(['primaryClass', `{${p.category}}`]);
  }
  const url = paperUrl(p);
  if (url) fields.push(['url', `{${url}}`]);
  return `@misc{${bibtexKey(p)},\n${fields.filter(([, v]) => v !== '{}').map(([k, v]) => `  ${k} = ${v}`).join(',\n')}\n}`;
}

/** APA 7: up to 20 authors; 21+ -> first 19, ellipsis, last. */
export function toApa(p: CitablePaper): string {
  const fmtAuthor = (a: string) => {
    const n = parseName(a);
    if (CJK.test(a)) return a;
    return n.given.length ? `${n.family}, ${n.given.map(initial).join(' ')}` : n.family;
  };
  const names = p.authors.map(fmtAuthor);
  let authors = '';
  if (names.length === 1) authors = names[0];
  else if (names.length > 1 && names.length <= 20) authors = `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  else if (names.length > 20) authors = `${names.slice(0, 19).join(', ')}, . . . ${names[names.length - 1]}`;
  const year = yearOf(p);
  const title = sentenceCase(p.title);
  const lead = authors ? `${authors} (${year}). ${title}.` : `${title}. (${year}).`;
  if (p.source === 'arxiv') return `${lead} arXiv. https://doi.org/10.48550/arXiv.${p.id}`;
  const url = paperUrl(p);
  return url ? `${lead} ${url}` : lead;
}

/**
 * GB/T 7714-2015 (electronic resource). Western surnames upper-case + initials without dots,
 * at most three authors followed by "et al." (or "等" for Chinese author lists).
 */
export function toGbt7714(p: CitablePaper, accessed: Date = new Date()): string {
  const fmtAuthor = (a: string) => {
    if (CJK.test(a)) return a.replace(/\s+/g, '');
    const n = parseName(a);
    const initials = n.given.map(g => g.split('-').map(x => (x.replace(/\./g, '')[0] || '').toUpperCase()).join('-')).join(' ');
    return `${n.family.toUpperCase()}${initials ? ' ' + initials : ''}`;
  };
  const chinese = p.authors.some(a => CJK.test(a));
  const names = p.authors.slice(0, 3).map(fmtAuthor);
  const authors = names.length ? names.join(', ') + (p.authors.length > 3 ? (chinese ? ', 等' : ', et al') : '') : '';
  const published = isoDate(p.publishedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const access = `${accessed.getFullYear()}-${pad(accessed.getMonth() + 1)}-${pad(accessed.getDate())}`; // local date
  const url = paperUrl(p);
  const parts = [
    `${authors ? authors + '. ' : ''}${tidyTitle(p.title)}[EB/OL].`,
    p.source === 'arxiv' ? ` arXiv:${p.id}.` : '',
    published || access ? ` (${published || yearOf(p)})[${access}].` : '',
    url ? ` ${url}.` : '',
  ];
  return parts.join('').trim();
}

export type CitationStyle = 'bibtex' | 'apa' | 'gbt';
export const formatCitation = (p: CitablePaper, style: CitationStyle, accessed?: Date) =>
  style === 'bibtex' ? toBibtex(p) : style === 'apa' ? toApa(p) : toGbt7714(p, accessed);
