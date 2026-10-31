import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus, Download, FileUp, Languages, Loader2, MessageSquarePlus, Sparkles, Square, X, Highlighter, ChevronDown,
} from 'lucide-react';
import type { Language } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer';
import HighlightList, { HIGHLIGHT_BG, HIGHLIGHT_DOT } from './HighlightList';
import { paperCache, type CachedTranslations } from './paperCache';
import {
  batchParagraphs, explainPrompt, parseNumberedBlocks, runAI, translatePrompt, translateSelectionPrompt, type AIContext,
} from './paperAI';
import { generateId, type PaperStudyApi } from './paperStore';
import { segmentParagraph } from './reader';
import { HIGHLIGHT_COLORS, type DocParagraph, type DocSection, type Highlight, type HighlightColor, type SavedPaper } from './types';
import type { useFullText } from './useFullText';
import { describeAIError, ErrorNote, fmt, getT, NoKeyPrompt } from './ui';

interface ReaderPanelProps {
  paper: SavedPaper;
  sections: DocSection[];
  fullText: ReturnType<typeof useFullText>;
  study: PaperStudyApi;
  language: Language;
  ai: AIContext;
  onOpenSettings?: () => void;
  notify: (m: string, type?: 'success' | 'error') => void;
  jumpTo: string | null; // highlight id to scroll to
  onJumped: () => void;
  onJump: (h: Highlight) => void;
}

interface Selection {
  paraId: string | null; // null: selection outside an original paragraph (e.g. translation column)
  start: number;
  end: number;
  text: string;
  top: number;
  left: number;
}

interface Assist {
  kind: 'explain' | 'translate';
  source: string;
  sectionTitle?: string;
  output: string;
  running: boolean;
  error: string | null;
  noKey: boolean;
}

const ReaderPanel: React.FC<ReaderPanelProps> = ({
  paper, sections, fullText, study, language, ai, onOpenSettings, notify, jumpTo, onJumped, onJump,
}) => {
  const t = getT(language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [assist, setAssist] = useState<Assist | null>(null);
  const [showRefs, setShowRefs] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // --- bilingual translation state ---
  const [bilingual, setBilingual] = useState(false);
  const [trLang, setTrLang] = useState<Language>(language);
  const [tr, setTr] = useState<CachedTranslations>({});
  const [job, setJob] = useState<{ done: number; total: number } | null>(null);
  const [trError, setTrError] = useState<{ noKey: boolean; message: string | null } | null>(null);
  const stopRef = useRef(false);
  const trRef = useRef<CachedTranslations>({});

  useEffect(() => {
    let cancelled = false;
    setTr({});
    trRef.current = {};
    paperCache.getTranslations(paper.id, trLang).then(c => {
      if (!cancelled && c) { trRef.current = c; setTr(c); }
    });
    return () => { cancelled = true; };
  }, [paper.id, trLang]);

  const paraIndex = useMemo(() => {
    const m = new Map<string, { para: DocParagraph; section: DocSection }>();
    sections.forEach(s => s.paragraphs.forEach(p => m.set(p.id, { para: p, section: s })));
    return m;
  }, [sections]);

  const highlightsByPara = useMemo(() => {
    const m = new Map<string, Highlight[]>();
    paper.highlights.forEach(h => m.set(h.paraId, [...(m.get(h.paraId) || []), h]));
    return m;
  }, [paper.highlights]);

  const order = useMemo(() => sections.flatMap(s => s.paragraphs.map(p => p.id)), [sections]);
  const translatable = useMemo(() => sections.filter(s => !s.isReferences).flatMap(s => s.paragraphs), [sections]);
  const translatedCount = translatable.filter(p => tr[p.id]).length;

  const translate = useCallback(async (paras: DocParagraph[]) => {
    const todo = paras.filter(p => !trRef.current[p.id]);
    if (!todo.length || job) return;
    setBilingual(true);
    setTrError(null);
    stopRef.current = false;
    let done = 0;
    setJob({ done, total: todo.length });
    try {
      for (const batch of batchParagraphs(todo, 4000)) {
        if (stopRef.current) break;
        const apply = (text: string) => {
          const blocks = parseNumberedBlocks(text);
          const next = { ...trRef.current };
          batch.forEach((p, i) => { const v = blocks.get(i + 1); if (v) next[p.id] = v; });
          trRef.current = next;
          setTr(next);
        };
        const out = await runAI(translatePrompt(batch.map(p => p.text), trLang), ai, apply);
        apply(out);
        done += batch.length;
        setJob({ done, total: todo.length });
        await paperCache.setTranslations(paper.id, trLang, trRef.current);
      }
      study.markActivity();
    } catch (e) {
      setTrError(describeAIError(e, t));
    } finally {
      setJob(null);
    }
  }, [job, trLang, ai, paper.id, study, t]);

  // --- jump to a highlight ---
  useEffect(() => {
    if (!jumpTo) return;
    const h = paper.highlights.find(x => x.id === jumpTo);
    if (h && paraIndex.get(h.paraId)?.section.isReferences) setShowRefs(true);
    const timer = setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-hl-id="${jumpTo}"]`) || scrollRef.current?.querySelector(`[data-para-id="${h?.paraId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlash(jumpTo);
      setTimeout(() => setFlash(null), 1600);
      onJumped();
    }, 60);
    return () => clearTimeout(timer);
  }, [jumpTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- selection handling ---
  const handleMouseUp = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount || !scrollRef.current) { if (noteDraft === null) setSel(null); return; }
    const range = s.getRangeAt(0);
    if (!scrollRef.current.contains(range.commonAncestorContainer)) return;
    const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
    const paraEl = startEl?.closest('[data-para-id]') as HTMLElement | null;
    const box = range.getBoundingClientRect();
    const host = scrollRef.current.getBoundingClientRect();
    const pos = { top: box.top - host.top + scrollRef.current.scrollTop - 46, left: Math.min(Math.max(box.left - host.left + box.width / 2, 150), host.width - 150) };

    if (!paraEl) {
      const text = s.toString().trim();
      if (text) setSel({ paraId: null, start: 0, end: 0, text, ...pos });
      return;
    }
    const paraId = paraEl.dataset.paraId!;
    const paraText = paraIndex.get(paraId)?.para.text || '';
    const pre = document.createRange();
    pre.selectNodeContents(paraEl);
    pre.setEnd(range.startContainer, range.startOffset);
    let start = pre.toString().length;
    // clip a multi-paragraph selection to its first paragraph
    let end = paraEl.contains(range.endContainer) ? start + range.toString().length : paraText.length;
    while (start < end && /\s/.test(paraText[start])) start++;
    while (end > start && /\s/.test(paraText[end - 1])) end--;
    if (end <= start) { setSel(null); return; }
    setSel({ paraId, start, end, text: paraText.slice(start, end), ...pos });
    setNoteDraft(null);
  };

  const clearSelection = () => { setSel(null); setNoteDraft(null); window.getSelection()?.removeAllRanges(); };

  const addHighlight = (color: HighlightColor, note?: string) => {
    if (!sel?.paraId) return;
    study.addHighlight(paper.id, {
      id: generateId(), paraId: sel.paraId, start: sel.start, end: sel.end, text: sel.text, color,
      note: note?.trim() || undefined, sectionTitle: paraIndex.get(sel.paraId)?.section.title || undefined, createdAt: Date.now(),
    });
    clearSelection();
  };

  const runAssist = async (kind: Assist['kind']) => {
    if (!sel) return;
    const source = sel.text;
    const info = sel.paraId ? paraIndex.get(sel.paraId) : undefined;
    setAssist({ kind, source, sectionTitle: info?.section.title, output: '', running: true, error: null, noKey: false });
    clearSelection();
    const prompt = kind === 'explain'
      ? explainPrompt(source, info?.para.text || source, paper.title, language)
      : translateSelectionPrompt(source, language);
    try {
      const out = await runAI(prompt, ai, text => setAssist(a => a && a.source === source ? { ...a, output: text } : a));
      setAssist(a => a && a.source === source ? { ...a, output: out, running: false } : a);
      study.markActivity();
    } catch (e) {
      const err = describeAIError(e, t);
      setAssist(a => a && { ...a, running: false, error: err.message, noKey: err.noKey });
    }
  };

  const saveAssistAsCard = () => {
    if (!assist?.output) return;
    study.addCards([{ id: generateId(), paperId: paper.id, term: assist.source.slice(0, 120), explanation: assist.output, where: assist.sectionTitle, createdAt: Date.now() }]);
    notify(t.paperCardAdded);
  };

  const scrollToSection = (id: string) => {
    scrollRef.current?.querySelector(`#sec-${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const { status, progress, error, doc } = fullText;
  const busy = status === 'downloading' || status === 'extracting';

  const renderParagraph = (p: DocParagraph) => {
    const segments = segmentParagraph(p.text, highlightsByPara.get(p.id) || []);
    const original = (
      <p data-para-id={p.id} className="text-[15px] leading-[1.8] text-gray-800">
        {segments.map(seg => seg.highlight ? (
          <mark key={seg.start} data-hl-id={seg.highlight.id} title={seg.highlight.note || undefined}
            onClick={() => onJump(seg.highlight!)}
            className={`${HIGHLIGHT_BG[seg.highlight.color]} cursor-pointer rounded-sm px-0.5 text-inherit ${seg.highlight.note ? 'underline decoration-amber-600/60 decoration-dotted underline-offset-4' : ''} ${flash === seg.highlight.id ? 'ring-2 ring-amber-500' : ''}`}>
            {seg.text}
          </mark>
        ) : <React.Fragment key={seg.start}>{seg.text}</React.Fragment>)}
      </p>
    );
    if (!bilingual) return <div key={p.id} className="mb-4">{original}</div>;
    return (
      <div key={p.id} className="mb-5 grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
        {original}
        <p data-tr-para={p.id} className={`text-[15px] leading-[1.8] ${tr[p.id] ? 'text-gray-700' : 'text-gray-300'} border-l-2 border-amber-200 pl-4`}>
          {tr[p.id] || '—'}
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Table of contents */}
      <nav className="hidden w-52 shrink-0 overflow-y-auto border-r border-gray-200 bg-white/60 px-3 py-5 custom-scrollbar xl:block">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t.paperContents}</p>
        {sections.map(s => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900" title={s.title}>
            {s.title || t.paperFrontMatter}
          </button>
        ))}
      </nav>

      {/* Reading column */}
      <div ref={scrollRef} onMouseUp={handleMouseUp} className="relative min-w-0 flex-1 overflow-y-auto custom-scrollbar" data-testid="reader">
        {/* Toolbar */}
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50/95 px-6 py-2 backdrop-blur">
          <button data-testid="toggle-bilingual" onClick={() => setBilingual(b => !b)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${bilingual ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
            <Languages size={13} /> {t.paperBilingual}
          </button>
          <select value={trLang} onChange={e => setTrLang(e.target.value as Language)} disabled={!!job}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 focus:outline-none" aria-label="Target language">
            <option value="zh">→ 中文</option>
            <option value="en">→ English</option>
          </select>
          {job ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-gray-600" data-testid="translate-progress">
                <Loader2 size={13} className="animate-spin" /> {fmt(t.paperTranslating, { done: job.done, total: job.total })}
              </span>
              <button onClick={() => { stopRef.current = true; }} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                <Square size={11} /> {t.paperStop}
              </button>
            </>
          ) : (
            <button data-testid="translate-all" onClick={() => translate(translatable)} disabled={translatedCount === translatable.length}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              {t.paperTranslateAll}
            </button>
          )}
          {translatedCount > 0 && !job && <span className="text-[11px] text-gray-400">{fmt(t.paperTranslatedCount, { done: translatedCount, total: translatable.length })}</span>}
          <div className="flex-1" />
          <span className="hidden items-center gap-1 text-[11px] text-gray-400 lg:flex"><Highlighter size={12} /> {t.paperSelectHint}</span>
        </div>

        <article className={`mx-auto px-6 py-8 ${bilingual ? 'max-w-6xl' : 'max-w-3xl'}`}>
          {/* Full-text status */}
          <div className="mb-8" data-testid="fulltext-status">
            {status === 'loading' ? null : busy ? (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
                <Loader2 size={15} className="animate-spin" />
                {status === 'downloading' ? t.paperFetchingPdf : progress ? fmt(t.paperExtracting, { n: progress[0], total: progress[1] }) : t.paperExtracting.replace(/….*$/, '…')}
              </div>
            ) : status === 'ready' && doc ? (
              <p className="text-[11px] text-gray-400">
                {fmt(t.paperFullTextInfo, { pages: doc.pageCount, sections: doc.sections.length })} · {t.paperExtractedNote}
              </p>
            ) : (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                {status === 'error' && <ErrorNote message={error === 'download' ? t.paperFetchFailed : t.paperExtractFailed} />}
                <p className="text-sm text-amber-900">{paper.summary ? t.paperAbstractOnly : t.paperNoText}</p>
                <div className="flex flex-wrap gap-2">
                  {paper.source === 'arxiv' && (
                    <button data-testid="fetch-fulltext" onClick={fullText.fetchFromArxiv} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                      <Download size={13} /> {t.paperFetchFull}
                    </button>
                  )}
                  <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <FileUp size={13} /> {t.paperUploadPdf}
                  </button>
                  <span className="self-center text-[11px] text-amber-800/70">{t.paperDropPdf}</span>
                </div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" data-testid="upload-pdf-input"
              onChange={e => { const f = e.target.files?.[0]; if (f) void fullText.loadFile(f); e.target.value = ''; }} />
          </div>

          {trError && <div className="mb-6">{trError.noKey ? <NoKeyPrompt t={t} onOpenSettings={onOpenSettings} /> : <ErrorNote message={trError.message || ''} />}</div>}

          {sections.map(s => {
            const translatedInSection = s.paragraphs.filter(p => tr[p.id]).length;
            return (
              <section key={s.id} id={`sec-${s.id}`} className="mb-8 scroll-mt-16">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight text-gray-900">{s.title || t.paperFrontMatter}</h2>
                  {!s.isReferences && (
                    <button onClick={() => translate(s.paragraphs)} disabled={!!job || translatedInSection === s.paragraphs.length}
                      data-testid="translate-section"
                      className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400 hover:text-gray-800 disabled:opacity-40">
                      <Languages size={12} />
                      {translatedInSection === s.paragraphs.length ? fmt(t.paperTranslatedCount, { done: translatedInSection, total: s.paragraphs.length }) : t.paperTranslateSection}
                    </button>
                  )}
                </div>
                {s.isReferences && !showRefs ? (
                  <button onClick={() => setShowRefs(true)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
                    <ChevronDown size={14} /> {fmt(t.paperShowReferences, { n: s.paragraphs.length })}
                  </button>
                ) : s.paragraphs.map(renderParagraph)}
              </section>
            );
          })}
        </article>

        {/* Floating selection toolbar */}
        {sel && (
          <div data-testid="selection-toolbar" onMouseDown={e => { if (!(e.target as HTMLElement).closest('textarea')) e.preventDefault(); }}
            className="absolute z-30 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
            style={{ top: Math.max(sel.top, 4), left: sel.left }}>
            {noteDraft === null ? (
              <div className="flex items-center gap-0.5">
                {sel.paraId && HIGHLIGHT_COLORS.map(c => (
                  <button key={c} data-testid={`hl-${c}`} onClick={() => addHighlight(c)} title={t.paperHighlight}
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-gray-100">
                    <span className={`h-3.5 w-3.5 rounded-full ${HIGHLIGHT_DOT[c]} ring-1 ring-black/5`} />
                  </button>
                ))}
                {sel.paraId && <span className="mx-1 h-5 w-px bg-gray-200" />}
                {sel.paraId && (
                  <button data-testid="sel-note" onClick={() => setNoteDraft('')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                    <MessageSquarePlus size={13} /> {t.paperAddNote}
                  </button>
                )}
                <button data-testid="sel-explain" onClick={() => runAssist('explain')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                  <Sparkles size={13} /> {t.paperExplain}
                </button>
                <button data-testid="sel-translate" onClick={() => runAssist('translate')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                  <Languages size={13} /> {t.paperTranslateSel}
                </button>
              </div>
            ) : (
              <div className="w-72 space-y-2 p-1">
                <textarea autoFocus data-testid="sel-note-input" value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={3}
                  placeholder={t.paperNotePlaceholder}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addHighlight('yellow', noteDraft); if (e.key === 'Escape') clearSelection(); }}
                  className="w-full resize-none rounded-lg border border-gray-200 p-2 text-xs focus:border-gray-400 focus:outline-none" />
                <div className="flex justify-end gap-1">
                  <button onClick={clearSelection} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">{t.cancel}</button>
                  <button data-testid="sel-note-save" onClick={() => addHighlight('yellow', noteDraft)} className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800">{t.save}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side panel: AI assist + highlights */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white/60 p-4 custom-scrollbar lg:block">
        {assist && (
          <div data-testid="assist-card" className="mb-5 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                {assist.kind === 'explain' ? <Sparkles size={13} /> : <Languages size={13} />}
                {assist.kind === 'explain' ? t.paperExplainTitle : t.paperTranslationTitle}
                {assist.running && <Loader2 size={12} className="animate-spin" />}
              </span>
              <button onClick={() => setAssist(null)} aria-label={t.close} className="rounded p-0.5 text-gray-400 hover:text-gray-700"><X size={13} /></button>
            </div>
            <p className="mb-2 line-clamp-3 border-l-2 border-amber-300 pl-2 text-xs italic text-gray-500">{assist.source}</p>
            {assist.noKey ? <NoKeyPrompt t={t} onOpenSettings={onOpenSettings} />
              : assist.error ? <ErrorNote message={assist.error} />
                : <div className="text-gray-800 [&_.prose]:text-[13px] [&_.prose]:leading-relaxed"><MarkdownRenderer content={assist.output || '…'} language={language} isStreaming={assist.running} /></div>}
            {assist.kind === 'explain' && assist.output && !assist.running && (
              <button data-testid="assist-save-card" onClick={saveAssistAsCard} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-900 hover:underline">
                <BookmarkPlus size={12} /> {t.paperMakeCard}
              </button>
            )}
          </div>
        )}
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t.paperHighlightsTitle} · {paper.highlights.length}</p>
        <HighlightList paper={paper} study={study} language={language} order={order} onJump={onJump} compact />
      </aside>
    </div>
  );
};

export default ReaderPanel;
