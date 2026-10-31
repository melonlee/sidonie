import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, Send, Trash2 } from 'lucide-react';
import type { Language } from '../../types';
import { isMissingApiKeyError } from '../../services/geminiService';
import MarkdownRenderer from '../MarkdownRenderer';
import { Bm25Index, chunkSections, type Chunk } from './bm25';
import { paperCache } from './paperCache';
import { chatPrompt, keywordPrompt, runAI, type AIContext } from './paperAI';
import type { PaperStudyApi } from './paperStore';
import type { ChatTurn, DocSection, SavedPaper } from './types';
import { describeAIError, ErrorNote, getT, NoKeyPrompt } from './ui';

const CJK = /[㐀-鿿]/;
const OVERVIEW = /abstract|摘要|introduction|conclusion|discussion/i;

/** Q&A grounded in the paper: BM25 picks the most relevant passages, answers cite their sections. */
const ChatPanel: React.FC<{
  paper: SavedPaper;
  sections: DocSection[];
  study: PaperStudyApi;
  language: Language;
  ai: AIContext;
  onOpenSettings?: () => void;
}> = ({ paper, sections, study, language, ai, onOpenSettings }) => {
  const t = getT(language);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<string | null>(null); // streaming answer
  const [error, setError] = useState<{ noKey: boolean; message: string | null } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chunks = useMemo(() => chunkSections(sections), [sections]);
  const index = useMemo(() => new Bm25Index(chunks), [chunks]);
  const docIsLatin = useMemo(() => !CJK.test(chunks.slice(0, 5).map(c => c.text).join(' ')), [chunks]);

  useEffect(() => { paperCache.getChat(paper.id).then(c => c && setTurns(c)); }, [paper.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, pending]);

  const retrieve = async (question: string): Promise<Chunk[]> => {
    let query = question;
    // Chinese question about an English paper: get English keywords first so BM25 can match
    if (CJK.test(question) && docIsLatin) {
      try {
        query += ' ' + (await runAI(keywordPrompt(question), ai));
      } catch (e) {
        if (isMissingApiKeyError(e)) throw e;
      }
    }
    const hits = index.search(query, 6);
    if (hits.length) return hits;
    return chunks.filter(c => OVERVIEW.test(c.sectionTitle)).slice(0, 4).concat(chunks.slice(0, 1)).slice(0, 4);
  };

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const question = input.trim();
    if (!question || pending !== null) return;
    setInput('');
    setError(null);
    const userTurn: ChatTurn = { role: 'user', text: question, at: Date.now() };
    const history = turns.slice(-6).map(x => ({ role: x.role, text: x.text }));
    setTurns(prev => [...prev, userTurn]);
    setPending('');
    try {
      const passages = await retrieve(question);
      const labelled = passages.map((c, i) => ({ label: `P${i + 1}`, section: c.sectionTitle, text: c.text }));
      const answer = await runAI(chatPrompt(question, paper.title, labelled, language), ai, setPending, history);
      const sources = [...new Set(passages.map(c => c.sectionTitle || t.paperFrontMatter))];
      setTurns(prev => {
        const next = [...prev, { role: 'model' as const, text: answer, sources, at: Date.now() }];
        void paperCache.setChat(paper.id, next);
        return next;
      });
      study.markActivity();
    } catch (err) {
      setError(describeAIError(err, t));
      setTurns(prev => prev.filter(x => x !== userTurn));
      setInput(question);
    } finally {
      setPending(null);
    }
  };

  const clear = () => { setTurns([]); void paperCache.setChat(paper.id, []); };

  return (
    <div className="flex h-full flex-col" data-testid="chat-panel">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-gray-500">{t.paperChatIntro}</p>
            {turns.length > 0 && (
              <button onClick={clear} className="flex shrink-0 items-center gap-1 text-xs text-gray-400 hover:text-gray-700"><Trash2 size={12} /> {t.paperClearChat}</button>
            )}
          </div>
          {turns.map((turn, i) => (
            <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
              {turn.role === 'user' ? (
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-gray-900 px-4 py-2.5 text-sm text-white">{turn.text}</div>
              ) : (
                <div data-testid="chat-answer" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <MarkdownRenderer content={turn.text} language={language} />
                  {turn.sources?.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
                      <BookOpen size={12} /> {t.paperSources}:
                      {turn.sources.map(s => <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5">§ {s}</span>)}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
          {pending !== null && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {pending ? <MarkdownRenderer content={pending} language={language} isStreaming /> : <Loader2 size={16} className="animate-spin text-gray-400" />}
            </div>
          )}
          {error && (error.noKey ? <NoKeyPrompt t={t} onOpenSettings={onOpenSettings} /> : <ErrorNote message={error.message || ''} />)}
          <div ref={endRef} />
        </div>
      </div>
      <form onSubmit={ask} className="shrink-0 border-t border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input data-testid="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder={t.paperChatPlaceholder}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5" />
          <button type="submit" disabled={!input.trim() || pending !== null} data-testid="chat-send"
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">
            {pending !== null ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatPanel;
