import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Paper } from '../../types';
import { newSrsState, scheduleReview } from '../../services/srs';
import { parseArxivId } from './arxiv';
import {
  PAPER_STATUSES, HIGHLIGHT_COLORS,
  type ExtractedDoc, type Flashcard, type Highlight, type PaperStatus, type PaperStudyStore, type SavedPaper,
} from './types';
import { dayKey } from './stats';

export const PAPER_STORE_KEY = 'sidonie_paper_study';
export const CURRENT_VERSION = 1 as const;

export const emptyStore = (): PaperStudyStore => ({ version: CURRENT_VERSION, papers: [], cards: [], activityDays: [] });

export const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// Older/hand-edited data may use other status spellings (e.g. "to-read", "done").
const STATUS_ALIASES: Record<string, PaperStatus> = {
  toread: 'toread', 'to-read': 'toread', todo: 'toread', unread: 'toread',
  reading: 'reading', 'in-progress': 'reading',
  read: 'read', done: 'read', finished: 'read',
};

const migrateHighlight = (h: unknown): Highlight | null => {
  if (!isObj(h) || typeof h.paraId !== 'string' || typeof h.text !== 'string') return null;
  const start = num(h.start, 0);
  return {
    id: str(h.id) || generateId(),
    paraId: h.paraId,
    start,
    end: Math.max(start, num(h.end, start + h.text.length)),
    text: h.text,
    color: HIGHLIGHT_COLORS.includes(h.color) ? h.color : 'yellow',
    note: typeof h.note === 'string' && h.note ? h.note : undefined,
    sectionTitle: typeof h.sectionTitle === 'string' ? h.sectionTitle : undefined,
    createdAt: num(h.createdAt, Date.now()),
  };
};

const migratePaper = (p: unknown): SavedPaper | null => {
  if (!isObj(p) || typeof p.id !== 'string' || !p.id) return null;
  const status = STATUS_ALIASES[str(p.status).toLowerCase()] || 'toread';
  return {
    id: p.id,
    source: p.source === 'local' || p.id.startsWith('local-') ? 'local' : 'arxiv',
    arxivVersion: typeof p.arxivVersion === 'string' ? p.arxivVersion : undefined,
    title: str(p.title, 'Untitled') || 'Untitled',
    authors: strArr(p.authors),
    summary: str(p.summary),
    publishedAt: typeof p.publishedAt === 'string' ? p.publishedAt : undefined,
    category: typeof p.category === 'string' ? p.category : undefined,
    link: typeof p.link === 'string' ? p.link : undefined,
    pdfLink: typeof p.pdfLink === 'string' ? p.pdfLink : undefined,
    status,
    tags: [...new Set(strArr(p.tags).map(t => t.trim()).filter(Boolean))],
    addedAt: num(p.addedAt, Date.now()),
    lastOpenedAt: typeof p.lastOpenedAt === 'number' ? p.lastOpenedAt : undefined,
    readAt: typeof p.readAt === 'number' ? p.readAt : status === 'read' ? num(p.addedAt, Date.now()) : undefined,
    notes: str(p.notes),
    highlights: (Array.isArray(p.highlights) ? p.highlights : []).map(migrateHighlight).filter((h): h is Highlight => !!h),
    hasFullText: p.hasFullText === true,
    needsMetadata: p.needsMetadata === true || undefined,
  };
};

const migrateCard = (c: unknown): Flashcard | null => {
  if (!isObj(c) || typeof c.term !== 'string' || typeof c.paperId !== 'string') return null;
  const base = newSrsState();
  return {
    id: str(c.id) || generateId(),
    paperId: c.paperId,
    term: c.term,
    explanation: str(c.explanation),
    where: typeof c.where === 'string' ? c.where : undefined,
    createdAt: num(c.createdAt, Date.now()),
    lastReviewed: num(c.lastReviewed, base.lastReviewed),
    nextReview: num(c.nextReview, base.nextReview),
    interval: num(c.interval, base.interval),
    easeFactor: num(c.easeFactor, base.easeFactor),
    streak: num(c.streak, base.streak),
  };
};

/**
 * Turn whatever is in localStorage into a valid current-version store.
 * Accepts: nothing / corrupt data (-> empty), a bare array of papers (pre-versioned shape),
 * or a versioned object with missing or malformed fields. Never throws.
 */
export function migratePaperStore(raw: unknown): PaperStudyStore {
  let data: unknown = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return emptyStore(); }
  }
  if (Array.isArray(data)) data = { papers: data };
  if (!isObj(data)) return emptyStore();

  const seen = new Set<string>();
  const papers = (Array.isArray(data.papers) ? data.papers : [])
    .map(migratePaper)
    .filter((p): p is SavedPaper => !!p && !seen.has(p.id) && !!seen.add(p.id));
  const paperIds = new Set(papers.map(p => p.id));
  const cards = (Array.isArray(data.cards) ? data.cards : [])
    .map(migrateCard)
    .filter((c): c is Flashcard => !!c && paperIds.has(c.paperId));
  const activityDays = [...new Set(strArr(data.activityDays).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();

  return { version: CURRENT_VERSION, papers, cards, activityDays };
}

const loadStore = (): PaperStudyStore => {
  try {
    return migratePaperStore(localStorage.getItem(PAPER_STORE_KEY));
  } catch {
    return emptyStore();
  }
};

/** Build a reading-list entry from a feed paper (arXiv ids are stored without version so duplicates collapse). */
export const savedPaperFromArxiv = (paper: Paper, status: PaperStatus = 'toread'): SavedPaper => {
  const parsed = parseArxivId(paper.id) || parseArxivId(paper.link || '');
  return {
    id: parsed?.id || paper.id,
    source: 'arxiv',
    arxivVersion: parsed?.version,
    title: paper.title,
    authors: paper.authors,
    summary: paper.summary,
    publishedAt: paper.publishedAt,
    category: paper.category,
    link: paper.link || (parsed ? `https://arxiv.org/abs/${parsed.id}` : undefined),
    pdfLink: paper.pdfLink || (parsed ? `https://arxiv.org/pdf/${parsed.id}` : undefined),
    status,
    tags: [],
    addedAt: Date.now(),
    notes: '',
    highlights: [],
  };
};

/**
 * Placeholder entry for an arXiv id when the metadata API is unreachable (e.g. a static
 * deployment whose CORS proxy is down). arxiv.org/pdf allows CORS, so the full text — and
 * with it the title and abstract — can still be loaded.
 */
export const placeholderArxivPaper = (id: string, version?: string): SavedPaper => ({
  id,
  source: 'arxiv',
  arxivVersion: version,
  title: `arXiv:${id}`,
  authors: [],
  summary: '',
  link: `https://arxiv.org/abs/${id}`,
  pdfLink: `https://arxiv.org/pdf/${id}`,
  status: 'toread',
  tags: [],
  addedAt: Date.now(),
  notes: '',
  highlights: [],
  needsMetadata: true,
});

/** Title and abstract guessed from extracted full text (for placeholder entries). */
export const metadataFromDoc = (doc: ExtractedDoc): { title?: string; summary?: string } => {
  const isAbstract = (t: string) => /^(\d+\.?\s*)?abstract$/i.test(t.trim());
  const titleSection = doc.sections.find(s => s.title && !isAbstract(s.title) && !/^\d/.test(s.title));
  const abstract = doc.sections.find(s => isAbstract(s.title));
  return {
    title: doc.pdfTitle || titleSection?.title,
    summary: abstract?.paragraphs.map(p => p.text).join('\n\n'),
  };
};

/** The reading-list key for a feed paper (arXiv id without version). */
export const paperKey = (paper: Pick<Paper, 'id' | 'link'>) => parseArxivId(paper.id)?.id || parseArxivId(paper.link || '')?.id || paper.id;

export const isPaperStatus = (s: string): s is PaperStatus => (PAPER_STATUSES as string[]).includes(s);

/**
 * Reading list, highlights, notes, flashcards and activity, persisted to localStorage.
 * Loaded synchronously in the initializer (loading in an effect raced with the save effect
 * under StrictMode and wiped data — see App.tsx).
 */
export function usePaperStudy() {
  const [store, setStore] = useState<PaperStudyStore>(loadStore);

  useEffect(() => {
    try {
      localStorage.setItem(PAPER_STORE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error('Could not persist the reading list', e);
    }
  }, [store]);

  const markActivity = useCallback(() => {
    const today = dayKey(Date.now());
    setStore(s => (s.activityDays.includes(today) ? s : { ...s, activityDays: [...s.activityDays, today] }));
  }, []);

  const addPaper = useCallback((paper: SavedPaper) => {
    setStore(s => (s.papers.some(p => p.id === paper.id) ? s : { ...s, papers: [paper, ...s.papers] }));
  }, []);

  const updatePaper = useCallback((id: string, patch: Partial<SavedPaper> | ((p: SavedPaper) => Partial<SavedPaper>)) => {
    setStore(s => ({
      ...s,
      papers: s.papers.map(p => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)),
    }));
  }, []);

  const setStatus = useCallback((id: string, status: PaperStatus) => {
    updatePaper(id, p => ({ status, readAt: status === 'read' ? (p.status === 'read' ? p.readAt : Date.now()) : p.readAt }));
    if (status !== 'toread') markActivity();
  }, [updatePaper, markActivity]);

  const removePaper = useCallback((id: string) => {
    setStore(s => ({ ...s, papers: s.papers.filter(p => p.id !== id), cards: s.cards.filter(c => c.paperId !== id) }));
  }, []);

  const addHighlight = useCallback((paperId: string, h: Highlight) => {
    updatePaper(paperId, p => ({ highlights: [...p.highlights, h] }));
    markActivity();
  }, [updatePaper, markActivity]);

  const updateHighlight = useCallback((paperId: string, id: string, patch: Partial<Highlight>) => {
    updatePaper(paperId, p => ({ highlights: p.highlights.map(h => (h.id === id ? { ...h, ...patch } : h)) }));
  }, [updatePaper]);

  const removeHighlight = useCallback((paperId: string, id: string) => {
    updatePaper(paperId, p => ({ highlights: p.highlights.filter(h => h.id !== id) }));
  }, [updatePaper]);

  const addCards = useCallback((cards: Omit<Flashcard, keyof ReturnType<typeof newSrsState>>[]) => {
    setStore(s => {
      const existing = new Set(s.cards.map(c => `${c.paperId}::${c.term.toLowerCase()}`));
      const fresh = cards
        .filter(c => !existing.has(`${c.paperId}::${c.term.toLowerCase()}`))
        .map(c => ({ ...newSrsState(), ...c }));
      return { ...s, cards: [...s.cards, ...fresh] };
    });
  }, []);

  const reviewCard = useCallback((id: string, correct: boolean) => {
    setStore(s => ({ ...s, cards: s.cards.map(c => (c.id === id ? scheduleReview(c, correct) : c)) }));
    markActivity();
  }, [markActivity]);

  const removeCard = useCallback((id: string) => {
    setStore(s => ({ ...s, cards: s.cards.filter(c => c.id !== id) }));
  }, []);

  return useMemo(() => ({
    store,
    markActivity, addPaper, updatePaper, setStatus, removePaper,
    addHighlight, updateHighlight, removeHighlight,
    addCards, reviewCard, removeCard,
  }), [store, markActivity, addPaper, updatePaper, setStatus, removePaper,
    addHighlight, updateHighlight, removeHighlight, addCards, reviewCard, removeCard]);
}

export type PaperStudyApi = ReturnType<typeof usePaperStudy>;
