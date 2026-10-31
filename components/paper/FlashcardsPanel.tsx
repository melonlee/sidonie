import React, { useMemo, useState } from 'react';
import { Brain, Check, Loader2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import type { Language } from '../../types';
import { isDue } from '../../services/srs';
import { buildPaperContext, contextBudgetChars, flashcardPrompt, parseFlashcards, runAI, type AIContext } from './paperAI';
import { generateId, type PaperStudyApi } from './paperStore';
import type { DocSection, Flashcard, SavedPaper } from './types';
import { describeAIError, ErrorNote, fmt, formatDate, getT, NoKeyPrompt } from './ui';

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

/** The workspace tab: extract key terms into flashcards, list them, and review the due ones. */
const FlashcardsPanel: React.FC<{
  paper: SavedPaper;
  sections: DocSection[];
  hasFullText: boolean;
  study: PaperStudyApi;
  language: Language;
  ai: AIContext;
  onOpenSettings?: () => void;
  onStartReview: (ids: string[]) => void;
}> = ({ paper, sections, hasFullText, study, language, ai, onOpenSettings, onStartReview }) => {
  const t = getT(language);
  const [running, setRunning] = useState(false);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState<{ noKey: boolean; message: string | null } | null>(null);
  const cards = study.store.cards.filter(c => c.paperId === paper.id);
  const due = cards.filter(c => isDue(c));

  const generate = async () => {
    setRunning(true);
    setError(null);
    setReceived(0);
    try {
      const context = hasFullText ? buildPaperContext(sections, Math.min(contextBudgetChars(ai.apiKeys), 60_000)) : paper.summary;
      const text = await runAI(flashcardPrompt(paper.title, context, language), ai, s => setReceived(s.length));
      const parsed = parseFlashcards(text);
      if (!parsed.length) { setError({ noKey: false, message: t.paperCardsParseError }); return; }
      study.addCards(parsed.map(c => ({ ...c, id: generateId(), paperId: paper.id, createdAt: Date.now() })));
      study.markActivity();
    } catch (e) {
      setError(describeAIError(e, t));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" data-testid="cards-panel">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-gray-500">{cards.length ? fmt(t.paperCardCount, { n: cards.length }) : t.paperCardsEmpty}</p>
          <div className="flex gap-2">
            {due.length > 0 && (
              <button data-testid="review-paper-cards" onClick={() => onStartReview(due.map(c => c.id))}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
                <Brain size={15} /> {fmt(t.paperReview, { n: due.length })}
              </button>
            )}
            <button data-testid="generate-cards" onClick={generate} disabled={running}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60">
              {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {running ? `${t.paperGeneratingCards}${received ? ` ${received}` : ''}` : t.paperGenerateCards}
            </button>
          </div>
        </div>
        {!hasFullText && !cards.length && <p className="mb-4 text-xs text-amber-800">{t.paperBasisAbstract}</p>}
        {error && <div className="mb-5">{error.noKey ? <NoKeyPrompt t={t} onOpenSettings={onOpenSettings} /> : <ErrorNote message={error.message || ''} />}</div>}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {cards.map(c => (
            <div key={c.id} data-testid="flashcard" className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900">{c.term}</h3>
                <button onClick={() => study.removeCard(c.id)} title={t.paperDelete} className="rounded p-1 text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100"><Trash2 size={13} /></button>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-gray-600">{c.explanation}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span className="truncate">{c.where ? `${t.paperAppearsIn}: ${c.where}` : ''}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 ${isDue(c) ? 'bg-amber-50 text-amber-800' : 'bg-gray-100'}`}>
                  {isDue(c) ? t.paperDueNow : fmt(t.paperNextReview, { date: formatDate(c.nextReview, language) })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlashcardsPanel;
