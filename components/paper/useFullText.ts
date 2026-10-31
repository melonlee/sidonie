import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchArxivPdf } from './arxiv';
import { paperCache } from './paperCache';
import { metadataFromDoc, type PaperStudyApi } from './paperStore';
import { extractPdf } from './pdfText';
import type { ExtractedDoc, SavedPaper } from './types';

export type FullTextStatus = 'loading' | 'idle' | 'downloading' | 'extracting' | 'ready' | 'error';
export type FullTextError = 'download' | 'extract' | null;

/**
 * Full text for a paper: cached in IndexedDB; otherwise fetched from arXiv (same proxy chain
 * as the feed) or read from a user-supplied PDF, then extracted with pdf.js.
 */
export function useFullText(paper: SavedPaper, study: PaperStudyApi) {
  const [doc, setDoc] = useState<ExtractedDoc | null>(null);
  const [status, setStatus] = useState<FullTextStatus>('loading');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<FullTextError>(null);
  const alive = useRef(true);
  const paperId = paper.id;

  // (re)set on mount: StrictMode runs mount -> unmount -> mount in dev
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const extract = useCallback(async (data: ArrayBuffer, source: ExtractedDoc['source']) => {
    setStatus('extracting');
    setProgress(null);
    try {
      const result = await extractPdf(data, source, (n, total) => alive.current && setProgress([n, total]));
      if (!result.sections.length) throw new Error('No text found (scanned PDF?)');
      await paperCache.setDoc(paperId, result);
      if (!alive.current) return;
      setDoc(result);
      setStatus('ready');
      setError(null);
      study.updatePaper(paperId, p => {
        if (!p.needsMetadata) return { hasFullText: true };
        const meta = metadataFromDoc(result);
        return { hasFullText: true, title: meta.title || p.title, summary: p.summary || meta.summary || '' };
      });
      study.markActivity();
    } catch (e) {
      console.error('PDF text extraction failed', e);
      if (!alive.current) return;
      setStatus('error');
      setError('extract');
    } finally {
      if (alive.current) setProgress(null);
    }
  }, [paperId, study]);

  // Load from cache; for imported PDFs extract from the stored file if text is missing
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      const cached = await paperCache.getDoc(paperId);
      if (cancelled) return;
      if (cached?.sections?.length) { setDoc(cached); setStatus('ready'); return; }
      if (paper.source === 'local') {
        const pdf = await paperCache.getPdf(paperId);
        if (cancelled) return;
        if (pdf) { void extract(pdf, 'upload'); return; }
      }
      setStatus('idle');
    })();
    return () => { cancelled = true; };
  }, [paperId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFromArxiv = useCallback(async () => {
    if (paper.source !== 'arxiv') return;
    setStatus('downloading');
    setError(null);
    try {
      const { data } = await fetchArxivPdf(paper.arxivVersion ? `${paper.id}${paper.arxivVersion}` : paper.id);
      if (!alive.current) return;
      await extract(data, 'arxiv');
    } catch (e) {
      console.warn(e);
      if (!alive.current) return;
      setStatus('error');
      setError('download');
    }
  }, [paper.id, paper.source, paper.arxivVersion, extract]);

  const loadFile = useCallback(async (file: File) => {
    const data = await file.arrayBuffer();
    if (paper.source === 'local') await paperCache.setPdf(paperId, data);
    await extract(data, 'upload');
  }, [paperId, paper.source, extract]);

  return { doc, status, progress, error, fetchFromArxiv, loadFile };
}
