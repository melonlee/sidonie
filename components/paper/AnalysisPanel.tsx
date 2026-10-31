import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { Language } from '../../types';
import MarkdownRenderer from '../MarkdownRenderer';
import { paperCache, type CachedAnalysis } from './paperCache';
import { analysisPrompt, buildPaperContext, contextBudgetChars, runAI, type AIContext } from './paperAI';
import type { PaperStudyApi } from './paperStore';
import type { DocSection, SavedPaper } from './types';
import { describeAIError, ErrorNote, getT, NoKeyPrompt } from './ui';

/** One-click structured close reading, grounded on the full text when available; cached per paper. */
const AnalysisPanel: React.FC<{
  paper: SavedPaper;
  sections: DocSection[];
  hasFullText: boolean;
  study: PaperStudyApi;
  language: Language;
  ai: AIContext;
  onOpenSettings?: () => void;
  onAnalysis?: (text: string) => void;
}> = ({ paper, sections, hasFullText, study, language, ai, onOpenSettings, onAnalysis }) => {
  const t = getT(language);
  const [analysis, setAnalysis] = useState<CachedAnalysis | null>(null);
  const [streaming, setStreaming] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<{ noKey: boolean; message: string | null } | null>(null);

  useEffect(() => {
    paperCache.getAnalysis(paper.id).then(a => { if (a) { setAnalysis(a); onAnalysis?.(a.text); } });
  }, [paper.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setRunning(true);
    setError(null);
    setStreaming('');
    const basis: CachedAnalysis['basis'] = hasFullText ? 'fulltext' : 'abstract';
    const context = basis === 'fulltext' ? buildPaperContext(sections, contextBudgetChars(ai.apiKeys)) : paper.summary;
    try {
      const text = await runAI(analysisPrompt(paper.title, context, basis, language), ai, setStreaming);
      if (!text.trim()) throw new Error('Empty response');
      const result: CachedAnalysis = { text, lang: language, basis, at: Date.now() };
      setAnalysis(result);
      onAnalysis?.(text);
      await paperCache.setAnalysis(paper.id, result);
      study.markActivity();
    } catch (e) {
      setError(describeAIError(e, t));
    } finally {
      setRunning(false);
      setStreaming('');
    }
  };

  const shown = running ? streaming : analysis?.text || '';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar" data-testid="analysis-panel">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-gray-500">{t.paperAnalysisIntro}</p>
          {analysis && !running ? (
            <button onClick={run} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <RefreshCw size={13} /> {t.paperRegenerate}
            </button>
          ) : (
            <button data-testid="run-analysis" onClick={run} disabled={running}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60">
              {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {running ? t.paperAnalyzing : t.paperAnalyze}
            </button>
          )}
        </div>

        {error && <div className="mb-5">{error.noKey ? <NoKeyPrompt t={t} onOpenSettings={onOpenSettings} /> : <ErrorNote message={error.message || ''} />}</div>}

        {(running || analysis) && (
          <p className={`mb-4 inline-block rounded-full px-2.5 py-0.5 text-[11px] ${(running ? hasFullText : analysis?.basis === 'fulltext') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {(running ? hasFullText : analysis?.basis === 'fulltext') ? t.paperBasisFull : t.paperBasisAbstract}
          </p>
        )}

        {shown ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <MarkdownRenderer content={shown} language={language} isStreaming={running} />
          </div>
        ) : running ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" /> {t.paperAnalyzing}</div>
        ) : null}
      </div>
    </div>
  );
};

export default AnalysisPanel;
