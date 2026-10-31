import { describe, it, expect } from 'vitest';
import { migratePaperStore, savedPaperFromArxiv, paperKey, CURRENT_VERSION } from '../components/paper/paperStore';
import { parseArxivId, toArxivQuery } from '../components/paper/arxiv';
import { computeStreak, papersReadThisWeek, dayKey } from '../components/paper/stats';
import type { SavedPaper } from '../components/paper/types';

describe('migratePaperStore', () => {
  it('returns an empty current-version store for missing or corrupt data', () => {
    for (const raw of [null, undefined, '', '{not json', 42, 'null', '"text"']) {
      expect(migratePaperStore(raw)).toEqual({ version: CURRENT_VERSION, papers: [], cards: [], activityDays: [] });
    }
  });

  it('accepts the pre-versioned shape (a bare array of papers) and fills defaults', () => {
    const store = migratePaperStore(JSON.stringify([{ id: '1706.03762', title: 'Attention', status: 'done' }]));
    expect(store.version).toBe(1);
    expect(store.papers).toHaveLength(1);
    const p = store.papers[0];
    expect(p).toMatchObject({ id: '1706.03762', source: 'arxiv', status: 'read', tags: [], notes: '', highlights: [], authors: [] });
    expect(typeof p.addedAt).toBe('number');
    expect(typeof p.readAt).toBe('number'); // read papers get a readAt for weekly stats
  });

  it('drops invalid entries, dedupes papers and tags, and repairs highlights', () => {
    const store = migratePaperStore({
      version: 1,
      papers: [
        { id: 'a', title: 'A', tags: ['ml', ' ml ', '', 3], status: 'weird', highlights: [
          { paraId: 'a-p0', text: 'hello', start: 2, color: 'purple' },
          { text: 'no para' },
        ] },
        { id: 'a', title: 'duplicate' },
        { title: 'no id' },
        'garbage',
        { id: 'local-xyz', title: '' },
      ],
      cards: [
        { paperId: 'a', term: 'BM25', explanation: 'ranking', interval: 'bad' },
        { paperId: 'missing', term: 'orphan' },
        { term: 'no paper' },
      ],
      activityDays: ['2026-10-30', '2026-10-30', 'yesterday', '2026-10-29'],
    });
    expect(store.papers.map(p => p.id)).toEqual(['a', 'local-xyz']);
    const a = store.papers[0];
    expect(a.title).toBe('A');
    expect(a.tags).toEqual(['ml']);
    expect(a.status).toBe('toread');
    expect(a.highlights).toHaveLength(1);
    expect(a.highlights[0]).toMatchObject({ paraId: 'a-p0', start: 2, end: 7, color: 'yellow' });
    expect(store.papers[1]).toMatchObject({ source: 'local', title: 'Untitled' });
    expect(store.cards).toHaveLength(1);
    expect(store.cards[0]).toMatchObject({ term: 'BM25', interval: 0, easeFactor: 2.5, nextReview: 0 });
    expect(store.activityDays).toEqual(['2026-10-29', '2026-10-30']);
  });

  it('is idempotent on an already-current store', () => {
    const once = migratePaperStore({ papers: [{ id: 'x', title: 'X', status: 'reading', tags: ['t'] }] });
    expect(migratePaperStore(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe('arXiv ids', () => {
  it('parses ids, versions and URLs', () => {
    expect(parseArxivId('1706.03762')).toEqual({ id: '1706.03762', version: undefined });
    expect(parseArxivId('arXiv:1706.03762v7')).toEqual({ id: '1706.03762', version: 'v7' });
    expect(parseArxivId('https://arxiv.org/abs/2401.01234v2')).toEqual({ id: '2401.01234', version: 'v2' });
    expect(parseArxivId('https://arxiv.org/pdf/2401.01234.pdf')).toEqual({ id: '2401.01234', version: undefined });
    expect(parseArxivId('http://arxiv.org/abs/hep-th/9901001v1')).toEqual({ id: 'hep-th/9901001', version: 'v1' });
    expect(parseArxivId('math.GT/0309136')).toEqual({ id: 'math.GT/0309136', version: undefined });
    expect(parseArxivId('attention is all you need')).toBeNull();
    expect(parseArxivId('https://example.com/1706.03762')).toBeNull();
  });

  it('keys feed papers without version so saving dedupes', () => {
    const feed = { id: '1706.03762v7', title: 'T', summary: '', authors: ['A B'], published: '', link: 'http://arxiv.org/abs/1706.03762v7', pdfLink: '', category: 'cs.CL' };
    expect(paperKey(feed)).toBe('1706.03762');
    const saved = savedPaperFromArxiv(feed);
    expect(saved).toMatchObject({ id: '1706.03762', arxivVersion: 'v7', status: 'toread', source: 'arxiv' });
  });

  it('turns free text into a phrase query but passes arXiv syntax through', () => {
    expect(toArxivQuery('spaced repetition')).toBe('all:"spaced repetition"');
    expect(toArxivQuery('cat:cs.CL')).toBe('cat:cs.CL');
  });
});

describe('study stats', () => {
  const now = new Date(2026, 9, 31, 15, 0).getTime(); // local time
  const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() - offset); return dayKey(d.getTime()); };

  it('counts a streak ending today or yesterday', () => {
    expect(computeStreak([day(0), day(1), day(2), day(4)], now)).toBe(3);
    expect(computeStreak([day(1), day(2)], now)).toBe(2);
    expect(computeStreak([day(2), day(3)], now)).toBe(0);
    expect(computeStreak([], now)).toBe(0);
  });

  it('counts papers read in the last 7 days', () => {
    const base: Omit<SavedPaper, 'id' | 'status'> = { title: '', authors: [], summary: '', source: 'arxiv', tags: [], addedAt: 0, notes: '', highlights: [] };
    const papers: SavedPaper[] = [
      { ...base, id: '1', status: 'read', readAt: now - 2 * 86400000 },
      { ...base, id: '2', status: 'read', readAt: now - 9 * 86400000 },
      { ...base, id: '3', status: 'reading', readAt: now - 86400000 },
      { ...base, id: '4', status: 'read' },
    ];
    expect(papersReadThisWeek(papers, now)).toBe(1);
  });
});
