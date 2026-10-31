import React, { useMemo, useState } from 'react';
import { Brain, Check, RotateCcw, X } from 'lucide-react';
import type { Language } from '../../types';
import type { Flashcard, SavedPaper } from './types';
import { fmt, getT } from './ui';

/**
 * Review due flashcards one by one. A forgotten card goes to the back of the queue
 * (the scheduler makes it due again immediately), so a session ends with everything recalled.
 */
export const ReviewSession: React.FC<{
  cards: Flashcard[];
  papers: SavedPaper[];
  language: Language;
  onAnswer: (id: string, correct: boolean) => void;
  onClose: () => void;
}> = ({ cards, papers, language, onAnswer, onClose }) => {
  const t = getT(language);
  // Snapshot the queue when the session opens; answering updates the store but not the queue order
  const [queue, setQueue] = useState<string[]>(() => cards.map(c => c.id));
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const total = useMemo(() => cards.length, []); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const card = queue.length ? byId.get(queue[0]) : undefined;
  const paper = card && papers.find(p => p.id === card.paperId);

  const answer = (correct: boolean) => {
    if (!card) return;
    onAnswer(card.id, correct);
    setRevealed(false);
    setQueue(q => (correct ? q.slice(1) : [...q.slice(1), q[0]]));
    if (correct) setDone(d => d + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div data-testid="review-session" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Brain size={16} /> {t.paperReviewTitle}</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{done}/{total}</span>
            <button onClick={onClose} aria-label={t.close} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100"><X size={16} /></button>
          </div>
        </div>
        <div className="h-1 bg-gray-100"><div className="h-1 bg-amber-400 transition-all" style={{ width: `${total ? (done / total) * 100 : 100}%` }} /></div>

        {!card ? (
          <div className="px-6 py-12 text-center">
            <Check size={28} className="mx-auto mb-3 text-emerald-600" />
            <p className="font-medium text-gray-900">{total ? t.paperReviewDone : t.paperNoCardsDue}</p>
            <button onClick={onClose} className="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">{t.close}</button>
          </div>
        ) : (
          <div className="px-6 py-6">
            {paper && <p className="mb-3 truncate text-[11px] uppercase tracking-wider text-gray-400">{paper.title}</p>}
            <p data-testid="review-term" className="text-xl font-semibold text-gray-900">{card.term}</p>
            {revealed ? (
              <div className="mt-4 space-y-3 animate-fade-in">
                <p className="leading-relaxed text-gray-700">{card.explanation}</p>
                {card.where && <p className="text-xs text-gray-400">{t.paperAppearsIn}: {card.where}</p>}
                <div className="flex gap-2 pt-3">
                  <button data-testid="review-forgot" onClick={() => answer(false)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    <RotateCcw size={15} /> {t.paperForgot}
                  </button>
                  <button data-testid="review-got-it" onClick={() => answer(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800">
                    <Check size={15} /> {t.paperGotIt}
                  </button>
                </div>
              </div>
            ) : (
              <button data-testid="review-reveal" onClick={() => setRevealed(true)} className="mt-6 w-full rounded-xl border border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700">
                {t.paperShowAnswer}
              </button>
            )}
            <p className="mt-4 text-center text-[11px] text-gray-400">{fmt(t.paperCardsDue, { n: queue.length })}</p>
          </div>
        )}
      </div>
    </div>
  );
};
