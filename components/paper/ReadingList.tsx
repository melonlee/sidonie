import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Brain, FileUp, Loader2, Plus, Tag, Trash2, X, ArrowUpRight, Users } from 'lucide-react';
import type { Language } from '../../types';
import { fetchArxivPaperById, parseArxivId } from './arxiv';
import { generateId, savedPaperFromArxiv, type PaperStudyApi } from './paperStore';
import { paperCache } from './paperCache';
import { extractPdf } from './pdfText';
import { dueCards } from './stats';
import { PAPER_STATUSES, type ExtractedDoc, type PaperStatus, type SavedPaper } from './types';
import { ErrorNote, fmt, formatDate, getT, statusLabel, STATUS_STYLES } from './ui';

interface ReadingListProps {
  api: PaperStudyApi;
  language: Language;
  onOpen: (id: string) => void;
  onStartReview: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
}

type SortKey = 'added' | 'opened' | 'title';

const ReadingList: React.FC<ReadingListProps> = ({ api, language, onOpen, onStartReview, notify }) => {
  const t = getT(language);
  const { store } = api;
  const [statusFilter, setStatusFilter] = useState<PaperStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('added');
  const [addInput, setAddInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importing, setImporting] = useState<ImportDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const due = dueCards(store.cards).length;
  const allTags = useMemo(() => [...new Set(store.papers.flatMap(p => p.tags))].sort(), [store.papers]);
  const counts = useMemo(() => {
    const c: Record<PaperStatus | 'all', number> = { all: store.papers.length, toread: 0, reading: 0, read: 0 };
    store.papers.forEach(p => c[p.status]++);
    return c;
  }, [store.papers]);

  const visible = useMemo(() => {
    const list = store.papers.filter(p =>
      (statusFilter === 'all' || p.status === statusFilter) && (!tagFilter || p.tags.includes(tagFilter)));
    return [...list].sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title)
        : sort === 'opened' ? (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0)
          : b.addedAt - a.addedAt);
  }, [store.papers, statusFilter, tagFilter, sort]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const parsed = parseArxivId(addInput);
    if (!parsed) { setAddError(t.paperAddInvalid); return; }
    if (store.papers.some(p => p.id === parsed.id)) { notify(t.paperAlreadySaved, 'error'); onOpen(parsed.id); return; }
    setAdding(true);
    try {
      const paper = await fetchArxivPaperById(parsed.id);
      if (!paper) { setAddError(t.paperAddNotFound); return; }
      api.addPaper(savedPaperFromArxiv(paper));
      setAddInput('');
      notify(t.paperSavedToast);
    } catch {
      setAddError(t.paperAddFailed);
    } finally {
      setAdding(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const draft: ImportDraft = { file, title: file.name.replace(/\.pdf$/i, ''), authors: '', progress: null, doc: null, error: null, data: null };
    setImporting(draft);
    try {
      const data = await file.arrayBuffer();
      const doc = await extractPdf(data, 'upload', (n, total) => setImporting(d => d && { ...d, progress: [n, total] }));
      setImporting(d => d && { ...d, data, doc, progress: null, title: doc.pdfTitle || d.title });
    } catch (e) {
      console.error(e);
      setImporting(d => d && { ...d, progress: null, error: t.paperImportFailed });
    }
  };

  const confirmImport = async () => {
    if (!importing) return;
    const id = `local-${generateId()}`;
    const abstract = importing.doc?.sections.find(s => /^abstract$/i.test(s.title.replace(/^\d+\.?\s*/, '')));
    const paper: SavedPaper = {
      id,
      source: 'local',
      title: importing.title.trim() || importing.file.name,
      authors: importing.authors.split(/[,，;；]/).map(a => a.trim()).filter(Boolean),
      summary: abstract ? abstract.paragraphs.map(p => p.text).join('\n\n') : '',
      status: 'toread',
      tags: [],
      addedAt: Date.now(),
      notes: '',
      highlights: [],
      hasFullText: !!importing.doc?.sections.length,
    };
    const data = importing.data || await importing.file.arrayBuffer();
    await paperCache.setPdf(id, data);
    if (importing.doc) await paperCache.setDoc(id, importing.doc);
    api.addPaper(paper);
    setImporting(null);
    notify(t.paperSavedToast);
  };

  const remove = (p: SavedPaper) => {
    if (!window.confirm(t.paperRemoveConfirm)) return;
    api.removePaper(p.id);
    void paperCache.clear(p.id);
  };

  return (
    <div className="space-y-5" data-testid="reading-list">
      {due > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <Brain size={18} className="text-amber-700" />
            {fmt(t.paperCardsDue, { n: due })}
          </div>
          <button data-testid="start-review" onClick={onStartReview} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
            {t.paperStartReview}
          </button>
        </div>
      )}

      {/* Add by id / import */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-start">
        <form onSubmit={handleAdd} className="flex flex-1 flex-col gap-1">
          <div className="flex gap-2">
            <input
              data-testid="add-arxiv-input"
              value={addInput}
              onChange={e => { setAddInput(e.target.value); setAddError(null); }}
              placeholder={t.paperAddPlaceholder}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5"
            />
            <button type="submit" disabled={adding || !addInput.trim()} className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
              {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {adding ? t.paperAdding : t.paperAdd}
            </button>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </form>
        <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <FileUp size={15} /> {t.paperImportPdf}
        </button>
        <input ref={fileRef} data-testid="import-pdf-input" type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={e => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(['all', ...PAPER_STATUSES] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} data-testid={`filter-${s}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${statusFilter === s ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'}`}>
            {s === 'all' ? t.paperAll : statusLabel(t, s)} <span className="ml-1 opacity-60">{counts[s]}</span>
          </button>
        ))}
        {allTags.length > 0 && <span className="mx-1 h-4 w-px bg-gray-200" />}
        {allTags.map(tag => (
          <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${tagFilter === tag ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400'}`}>
            <Tag size={11} /> {tag}
          </button>
        ))}
        <div className="flex-1" />
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none">
          <option value="added">{t.paperSortRecent}</option>
          <option value="opened">{t.paperSortOpened}</option>
          <option value="title">{t.paperSortTitle}</option>
        </select>
      </div>

      {store.papers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-14 text-center text-sm text-gray-500">
          <BookOpen size={28} className="mx-auto mb-3 text-gray-300" />
          {t.paperEmptyList}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">{t.paperNoMatch}</div>
      ) : (
        <div className="space-y-3">
          {visible.map(p => (
            <PaperRow key={p.id} paper={p} language={language} api={api} onOpen={() => onOpen(p.id)} onRemove={() => remove(p)}
              cardCount={store.cards.filter(c => c.paperId === p.id).length} />
          ))}
        </div>
      )}

      {importing && (
        <ImportDialog draft={importing} language={language} onChange={setImporting} onCancel={() => setImporting(null)} onConfirm={confirmImport} />
      )}
    </div>
  );
};

const PaperRow: React.FC<{
  paper: SavedPaper; language: Language; api: PaperStudyApi; cardCount: number; onOpen: () => void; onRemove: () => void;
}> = ({ paper, language, api, cardCount, onOpen, onRemove }) => {
  const t = getT(language);
  const [tagInput, setTagInput] = useState<string | null>(null);

  const addTag = () => {
    const tag = (tagInput || '').trim();
    if (tag && !paper.tags.includes(tag)) api.updatePaper(paper.id, { tags: [...paper.tags, tag] });
    setTagInput(null);
  };

  return (
    <div data-testid="paper-row" className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-gray-600">
              {paper.source === 'local' ? t.paperLocalPdf : paper.category || 'arXiv'}
            </span>
            {paper.source === 'arxiv' && <span className="font-mono">{paper.id}</span>}
            <span>· {fmt(t.paperAddedOn, { date: formatDate(paper.addedAt, language) })}</span>
            <span>· {paper.lastOpenedAt ? fmt(t.paperOpenedOn, { date: formatDate(paper.lastOpenedAt, language) }) : t.paperNeverOpened}</span>
            {paper.highlights.length > 0 && <span>· {fmt(t.paperHighlightCount, { n: paper.highlights.length })}</span>}
            {cardCount > 0 && <span>· {fmt(t.paperCardCount, { n: cardCount })}</span>}
          </div>
          <button onClick={onOpen} className="text-left font-semibold leading-snug text-gray-900 hover:underline decoration-gray-300 underline-offset-4">
            {paper.title}
          </button>
          {paper.authors.length > 0 && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500"><Users size={12} className="shrink-0" />{paper.authors.join(', ')}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {paper.tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900 border border-amber-100">
                {tag}
                <button aria-label={`remove ${tag}`} onClick={() => api.updatePaper(paper.id, { tags: paper.tags.filter(x => x !== tag) })} className="opacity-50 hover:opacity-100"><X size={10} /></button>
              </span>
            ))}
            {tagInput === null ? (
              <button onClick={() => setTagInput('')} className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400 hover:text-gray-700">
                <Plus size={10} /> {t.paperAddTag}
              </button>
            ) : (
              <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)} onBlur={addTag}
                onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagInput(null); }}
                className="w-28 rounded-full border border-gray-300 px-2 py-0.5 text-[11px] focus:outline-none" placeholder={t.paperAddTag} />
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200 text-[11px] font-medium">
            {PAPER_STATUSES.map(s => (
              <button key={s} onClick={() => api.setStatus(paper.id, s)} data-testid={`status-${s}`}
                className={`px-2.5 py-1 transition-colors ${paper.status === s ? STATUS_STYLES[s] : 'bg-white text-gray-400 hover:text-gray-700'}`}>
                {statusLabel(t, s)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onRemove} title={t.paperRemove} className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
            <button data-testid="open-paper" onClick={onOpen} className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
              {t.paperOpen} <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ImportDraft {
  file: File;
  title: string;
  authors: string;
  progress: [number, number] | null;
  doc: ExtractedDoc | null;
  data: ArrayBuffer | null;
  error: string | null;
}

const ImportDialog: React.FC<{
  draft: ImportDraft; language: Language;
  onChange: React.Dispatch<React.SetStateAction<ImportDraft | null>>; onCancel: () => void; onConfirm: () => void;
}> = ({ draft, language, onChange, onCancel, onConfirm }) => {
  const t = getT(language);
  const busy = !draft.doc && !draft.error;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="import-dialog">
        <h3 className="text-lg font-semibold text-gray-900">{t.paperImportTitle}</h3>
        <p className="truncate text-xs text-gray-400">{draft.file.name}</p>
        {busy && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" />
            {draft.progress ? fmt(t.paperExtracting, { n: draft.progress[0], total: draft.progress[1] }) : t.paperFetchingPdf}
          </p>
        )}
        {draft.error && <ErrorNote message={draft.error} />}
        <label className="block text-xs font-medium text-gray-600">
          {t.paperTitleLabel}
          <input data-testid="import-title" value={draft.title} onChange={e => onChange(d => d && { ...d, title: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none" />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {t.paperAuthorsLabel}
          <input value={draft.authors} onChange={e => onChange(d => d && { ...d, authors: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">{t.cancel}</button>
          <button data-testid="import-confirm" disabled={busy || !draft.title.trim()} onClick={onConfirm}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">{t.save}</button>
        </div>
      </div>
    </div>
  );
};

export default ReadingList;
