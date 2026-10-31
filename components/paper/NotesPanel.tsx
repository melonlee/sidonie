import React, { useEffect, useState } from 'react';
import { Eye, NotebookPen, PencilLine, Send } from 'lucide-react';
import type { Language } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer';
import HighlightList from './HighlightList';
import type { PaperStudyApi } from './paperStore';
import { buildExportNote } from './reader';
import type { Highlight, SavedPaper } from './types';
import { getT, statusLabel } from './ui';

/** Highlights with notes, a per-paper Markdown note, and "Export to Notes". */
const NotesPanel: React.FC<{
  paper: SavedPaper;
  study: PaperStudyApi;
  language: Language;
  order: string[];
  analysis: string;
  onJump: (h: Highlight) => void;
  onSaveNote: (title: string, content: string, tags?: string[]) => void;
}> = ({ paper, study, language, order, analysis, onJump, onSaveNote }) => {
  const t = getT(language);
  const [draft, setDraft] = useState(paper.notes);
  const [preview, setPreview] = useState(false);

  // Debounced autosave of the markdown note
  useEffect(() => {
    if (draft === paper.notes) return;
    const id = setTimeout(() => study.updatePaper(paper.id, { notes: draft }), 400);
    return () => clearTimeout(id);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportToNotes = () => {
    const current = { ...paper, notes: draft };
    const content = buildExportNote(current, {
      statusLabel: statusLabel(t, paper.status),
      analysis,
      sectionOrder: order,
      labels: {
        authors: t.authors, published: t.published, status: t.paperExportStatus, tags: t.paperTagsLabel, link: t.paperExportLink,
        tldr: 'TL;DR', highlights: t.paperHighlightsTitle, note: t.paperAddNote, myNotes: t.paperMyNotes, citation: t.paperCite,
      },
    });
    onSaveNote(paper.title, content, [t.paperExportTag, ...paper.tags]);
    study.updatePaper(paper.id, { notes: draft });
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" data-testid="notes-panel">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t.paperHighlightsTitle} · {paper.highlights.length}</h2>
          <HighlightList paper={paper} study={study} language={language} order={order} onJump={onJump} />
        </section>
        <section className="flex min-h-[28rem] flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"><NotebookPen size={13} /> {t.paperMyNotes}</h2>
            <div className="flex gap-2">
              <button onClick={() => setPreview(p => !p)} className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
                {preview ? <PencilLine size={12} /> : <Eye size={12} />} {preview ? t.paperEdit : t.paperPreview}
              </button>
              <button data-testid="export-notes" onClick={exportToNotes} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800">
                <Send size={12} /> {t.paperExportNotes}
              </button>
            </div>
          </div>
          {preview ? (
            <div className="flex-1 rounded-2xl border border-gray-200 bg-white p-5"><MarkdownRenderer content={draft || '—'} language={language} /></div>
          ) : (
            <textarea data-testid="paper-notes" value={draft} onChange={e => setDraft(e.target.value)} placeholder={t.paperMyNotesPlaceholder}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-white p-5 font-mono text-sm leading-relaxed text-gray-800 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5" />
          )}
        </section>
      </div>
    </div>
  );
};

export default NotesPanel;
