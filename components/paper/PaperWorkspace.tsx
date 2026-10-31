import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, Brain, ExternalLink, FileText, MessagesSquare, NotebookPen, Sparkles } from 'lucide-react';
import type { ApiKeys, Language, UserProfile } from '../../types';
import AnalysisPanel from './AnalysisPanel';
import ChatPanel from './ChatPanel';
import CitationMenu from './CitationMenu';
import FlashcardsPanel from './FlashcardsPanel';
import NotesPanel from './NotesPanel';
import { paperCache } from './paperCache';
import { fetchArxivPaperById } from './arxiv';
import { savedPaperFromArxiv, type PaperStudyApi } from './paperStore';
import ReaderPanel from './ReaderPanel';
import { buildReaderSections } from './reader';
import { PAPER_STATUSES, type Highlight, type SavedPaper } from './types';
import { useFullText } from './useFullText';
import { getT, statusLabel, STATUS_STYLES } from './ui';

export interface WorkspaceProps {
  paper: SavedPaper;
  study: PaperStudyApi;
  language: Language;
  apiKeys: ApiKeys;
  userProfile: UserProfile;
  onBack: () => void;
  onSaveNote: (title: string, content: string, tags?: string[]) => void;
  onOpenSettings?: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  onStartReview: (cardIds: string[]) => void;
}

type Tab = 'read' | 'analysis' | 'chat' | 'cards' | 'notes';

/** Focused reading view for one saved paper. Panels stay mounted once visited, so streams survive tab switches. */
const PaperWorkspace: React.FC<WorkspaceProps> = ({
  paper, study, language, apiKeys, userProfile, onBack, onSaveNote, onOpenSettings, notify, onStartReview,
}) => {
  const t = getT(language);
  const [tab, setTab] = useState<Tab>('read');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['read']));
  const [editingTitle, setEditingTitle] = useState(false);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [dragging, setDragging] = useState(false);
  const fullText = useFullText(paper, study);
  const ai = useMemo(() => ({ apiKeys, userProfile }), [apiKeys, userProfile]);
  const sections = useMemo(() => buildReaderSections(paper, fullText.doc, t.paperAbstract), [paper.summary, fullText.doc, t.paperAbstract]); // eslint-disable-line react-hooks/exhaustive-deps
  const order = useMemo(() => sections.flatMap(s => s.paragraphs.map(p => p.id)), [sections]);
  const hasFullText = !!fullText.doc?.sections.length;
  const cardCount = study.store.cards.filter(c => c.paperId === paper.id).length;

  // Entries added while the arXiv API was unreachable: try to complete their metadata now
  useEffect(() => {
    if (!paper.needsMetadata || paper.source !== 'arxiv') return;
    let cancelled = false;
    fetchArxivPaperById(paper.id).then(found => {
      if (!found || cancelled) return;
      const full = savedPaperFromArxiv(found);
      study.updatePaper(paper.id, {
        title: full.title, authors: full.authors, summary: full.summary, publishedAt: full.publishedAt,
        category: full.category, arxivVersion: full.arxivVersion, needsMetadata: undefined,
      });
    }).catch(() => { /* still offline: keep what the PDF gave us */ });
    return () => { cancelled = true; };
  }, [paper.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next: Tab) => { setTab(next); setVisited(v => (v.has(next) ? v : new Set(v).add(next))); };
  const jump = (h: Highlight) => { go('read'); setJumpTo(h.id); };

  const openLocalPdf = async () => {
    const data = await paperCache.getPdf(paper.id);
    if (!data) return;
    window.open(URL.createObjectURL(new Blob([data], { type: 'application/pdf' })), '_blank', 'noopener');
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'read', label: t.paperTabFullText, icon: BookOpenText },
    { id: 'analysis', label: t.paperTabAnalysis, icon: Sparkles },
    { id: 'chat', label: t.paperTabChat, icon: MessagesSquare },
    { id: 'cards', label: t.paperTabCards, icon: Brain, badge: cardCount },
    { id: 'notes', label: t.paperTabNotes, icon: NotebookPen, badge: paper.highlights.length },
  ];

  return (
    <div
      className="relative flex h-full flex-col bg-gray-50"
      data-testid="paper-workspace"
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => {
        const f = Array.from(e.dataTransfer.files).find(x => x.type === 'application/pdf' || x.name.toLowerCase().endsWith('.pdf'));
        if (!f) return;
        e.preventDefault();
        setDragging(false);
        go('read');
        void fullText.loadFile(f);
      }}
    >
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button data-testid="workspace-back" onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <ArrowLeft size={16} /> {t.paperBack}
          </button>
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input autoFocus defaultValue={paper.title} data-testid="workspace-title-input"
                onBlur={e => { study.updatePaper(paper.id, { title: e.target.value.trim() || paper.title }); setEditingTitle(false); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingTitle(false); }}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-base font-semibold focus:outline-none" />
            ) : (
              <h1 data-testid="workspace-title" className="truncate text-base font-semibold text-gray-900" title={paper.title}
                onDoubleClick={() => setEditingTitle(true)}>{paper.title}</h1>
            )}
            <p className="truncate text-xs text-gray-500">
              {paper.source === 'arxiv' && <span className="font-mono">arXiv:{paper.id} · </span>}
              {paper.authors.join(', ')}
            </p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200 text-[11px] font-medium" data-testid="workspace-status">
            {PAPER_STATUSES.map(s => (
              <button key={s} onClick={() => study.setStatus(paper.id, s)}
                className={`px-2.5 py-1 ${paper.status === s ? STATUS_STYLES[s] : 'bg-white text-gray-400 hover:text-gray-700'}`}>
                {statusLabel(t, s)}
              </button>
            ))}
          </div>
          <CitationMenu paper={paper} language={language} notify={notify} />
          {paper.source === 'arxiv' ? (
            <>
              <a href={`https://arxiv.org/abs/${paper.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <ExternalLink size={13} /> {t.paperArxivPage}
              </a>
              <a href={`https://arxiv.org/pdf/${paper.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <FileText size={13} /> {t.paperPdf}
              </a>
            </>
          ) : (
            <button onClick={openLocalPdf} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <FileText size={13} /> {t.paperPdf}
            </button>
          )}
        </div>
        <nav className="mt-2 flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => go(id)} data-testid={`ws-tab-${id}`}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={15} /> {label}
              {!!badge && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600">{badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="relative min-h-0 flex-1">
        {visited.has('read') && (
          <div className={tab === 'read' ? 'h-full' : 'hidden'}>
            <ReaderPanel paper={paper} sections={sections} fullText={fullText} study={study} language={language} ai={ai}
              onOpenSettings={onOpenSettings} notify={notify} jumpTo={jumpTo} onJumped={() => setJumpTo(null)} onJump={jump} />
          </div>
        )}
        {/* Analysis mounts eagerly (hidden) so its cached TL;DR is available to the Notes export */}
        <div className={tab === 'analysis' ? 'h-full' : 'hidden'}>
          <AnalysisPanel paper={paper} sections={sections} hasFullText={hasFullText} study={study} language={language} ai={ai}
            onOpenSettings={onOpenSettings} onAnalysis={setAnalysis} />
        </div>
        {visited.has('chat') && (
          <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
            <ChatPanel paper={paper} sections={sections} study={study} language={language} ai={ai} onOpenSettings={onOpenSettings} />
          </div>
        )}
        {visited.has('cards') && (
          <div className={tab === 'cards' ? 'h-full' : 'hidden'}>
            <FlashcardsPanel paper={paper} sections={sections} hasFullText={hasFullText} study={study} language={language} ai={ai}
              onOpenSettings={onOpenSettings} onStartReview={onStartReview} />
          </div>
        )}
        {visited.has('notes') && (
          <div className={tab === 'notes' ? 'h-full' : 'hidden'}>
            <NotesPanel paper={paper} study={study} language={language} order={order} analysis={analysis} onJump={jump} onSaveNote={onSaveNote} />
          </div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/80 text-sm font-medium text-amber-900">
            {t.paperDropPdf}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaperWorkspace;
