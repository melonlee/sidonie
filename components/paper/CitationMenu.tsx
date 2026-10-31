import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Quote } from 'lucide-react';
import type { Language } from '../../types';
import { formatCitation, type CitationStyle } from './citation';
import type { SavedPaper } from './types';
import { fmt, getT } from './ui';

const STYLES: CitationStyle[] = ['bibtex', 'apa', 'gbt'];

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts / denied permission
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
};

const CitationMenu: React.FC<{ paper: SavedPaper; language: Language; notify: (m: string) => void }> = ({ paper, language, notify }) => {
  const t = getT(language);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CitationStyle>(language === 'zh' ? 'gbt' : 'apa');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = (s: CitationStyle) => (s === 'bibtex' ? t.paperCopyBibtex : s === 'apa' ? t.paperCopyApa : t.paperCopyGbt);
  const text = formatCitation(paper, style);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      notify(fmt(t.paperCopied, { style: label(style) }));
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button data-testid="cite-button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <Quote size={13} /> {t.paperCite}
      </button>
      {open && (
        <div data-testid="cite-menu" className="absolute right-0 top-full z-40 mt-2 w-[min(32rem,90vw)] rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex gap-1">
            {STYLES.map(s => (
              <button key={s} data-testid={`cite-style-${s}`} onClick={() => setStyle(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${style === s ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label(s)}
              </button>
            ))}
          </div>
          <pre data-testid="cite-text" className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-800">{text}</pre>
          <div className="mt-2 flex justify-end">
            <button data-testid="cite-copy" onClick={copy} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
              {copied ? <Check size={13} /> : <Copy size={13} />} {t.paperCopy}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CitationMenu;
