import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import type { ApiKeys, Language, UserProfile } from '../../types';
import CitationMenu from './CitationMenu';
import type { PaperStudyApi } from './paperStore';
import { PAPER_STATUSES, type SavedPaper } from './types';
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

const PaperWorkspace: React.FC<WorkspaceProps> = ({ paper, study, language, onBack, notify }) => {
  const t = getT(language);
  const [editingTitle, setEditingTitle] = useState(false);

  return (
    <div className="flex h-full flex-col bg-gray-50" data-testid="paper-workspace">
      <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button data-testid="workspace-back" onClick={onBack} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900">
            <ArrowLeft size={16} /> {t.paperBack}
          </button>
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input autoFocus defaultValue={paper.title}
                onBlur={e => { study.updatePaper(paper.id, { title: e.target.value.trim() || paper.title }); setEditingTitle(false); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-base font-semibold focus:outline-none" />
            ) : (
              <h1 className="truncate text-base font-semibold text-gray-900" title={paper.title}
                onDoubleClick={() => setEditingTitle(true)}>{paper.title}</h1>
            )}
            <p className="truncate text-xs text-gray-500">{paper.authors.join(', ')}</p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-gray-200 text-[11px] font-medium">
            {PAPER_STATUSES.map(s => (
              <button key={s} onClick={() => study.setStatus(paper.id, s)}
                className={`px-2.5 py-1 ${paper.status === s ? STATUS_STYLES[s] : 'bg-white text-gray-400 hover:text-gray-700'}`}>
                {statusLabel(t, s)}
              </button>
            ))}
          </div>
          <CitationMenu paper={paper} language={language} notify={notify} />
          {paper.link && (
            <a href={paper.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <ExternalLink size={13} /> {t.paperArxivPage}
            </a>
          )}
          {paper.pdfLink && (
            <a href={paper.pdfLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <FileText size={13} /> {t.paperPdf}
            </a>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <article className="mx-auto max-w-3xl px-6 py-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">{t.paperAbstract}</h2>
          <p className="leading-relaxed text-gray-800">{paper.summary}</p>
        </article>
      </div>
    </div>
  );
};

export default PaperWorkspace;
