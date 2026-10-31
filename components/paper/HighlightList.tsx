import React, { useState } from 'react';
import { Crosshair, MessageSquare, Trash2 } from 'lucide-react';
import type { Language } from '../../types';
import type { PaperStudyApi } from './paperStore';
import type { Highlight, HighlightColor, SavedPaper } from './types';
import { getT } from './ui';

export const HIGHLIGHT_BG: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-200/70',
  green: 'bg-emerald-200/70',
  blue: 'bg-sky-200/70',
  pink: 'bg-pink-200/70',
};
export const HIGHLIGHT_DOT: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-300',
  green: 'bg-emerald-300',
  blue: 'bg-sky-300',
  pink: 'bg-pink-300',
};

/** Highlights in reading order, with inline note editing. Clicking an item jumps to it in the reader. */
const HighlightList: React.FC<{
  paper: SavedPaper;
  study: PaperStudyApi;
  language: Language;
  order: string[]; // paragraph ids in document order
  onJump: (h: Highlight) => void;
  compact?: boolean;
}> = ({ paper, study, language, order, onJump, compact }) => {
  const t = getT(language);
  const [editing, setEditing] = useState<string | null>(null);
  const rank = (h: Highlight) => { const i = order.indexOf(h.paraId); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const items = [...paper.highlights].sort((a, b) => rank(a) - rank(b) || a.start - b.start);

  if (!items.length) return <p className="px-1 py-4 text-sm leading-relaxed text-gray-400">{t.paperNoHighlights}</p>;

  return (
    <ul className="space-y-2" data-testid="highlight-list">
      {items.map(h => (
        <li key={h.id} data-testid="highlight-item" className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <button onClick={() => onJump(h)} className="flex w-full items-start gap-2 text-left">
            <span className={`mt-1 h-3 w-1 shrink-0 rounded-full ${HIGHLIGHT_DOT[h.color]}`} />
            <span className={`text-[13px] leading-snug text-gray-800 ${compact ? 'line-clamp-3' : ''}`}>{h.text}</span>
          </button>
          {h.sectionTitle && <p className="ml-3 mt-1 truncate text-[11px] text-gray-400">§ {h.sectionTitle}</p>}
          {editing === h.id ? (
            <textarea
              autoFocus
              defaultValue={h.note || ''}
              placeholder={t.paperNotePlaceholder}
              onBlur={e => { study.updateHighlight(paper.id, h.id, { note: e.target.value.trim() || undefined }); setEditing(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur(); }}
              className="ml-3 mt-2 w-[calc(100%-0.75rem)] resize-y rounded-lg border border-gray-200 p-2 text-xs focus:border-gray-400 focus:outline-none"
              rows={3}
            />
          ) : h.note ? (
            <p onClick={() => setEditing(h.id)} className="ml-3 mt-2 cursor-text whitespace-pre-wrap rounded-lg bg-amber-50/80 p-2 text-xs text-gray-700">{h.note}</p>
          ) : null}
          <div className="ml-3 mt-2 flex gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <button onClick={() => onJump(h)} title="Jump" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Crosshair size={13} /></button>
            <button onClick={() => setEditing(h.id)} title={t.paperAddNote} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><MessageSquare size={13} /></button>
            <button onClick={() => study.removeHighlight(paper.id, h.id)} title={t.paperDelete} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default HighlightList;
