// Small shared UI pieces for the paper study components.
import React from 'react';
import { KeyRound } from 'lucide-react';
import { TRANSLATIONS } from '../../constants';
import { isMissingApiKeyError } from '../../services/geminiService';
import type { Language } from '../../types';
import type { PaperStatus } from './types';

export type T = (typeof TRANSLATIONS)['en'];
export const getT = (language: Language): T => TRANSLATIONS[language] as T;

/** Fill `{name}` placeholders in a translated string. */
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export const statusLabel = (t: T, s: PaperStatus) =>
  s === 'toread' ? t.paperStatusToread : s === 'reading' ? t.paperStatusReading : t.paperStatusRead;

export const STATUS_STYLES: Record<PaperStatus, string> = {
  toread: 'bg-gray-100 text-gray-600 border-gray-200',
  reading: 'bg-amber-50 text-amber-800 border-amber-200',
  read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const formatDate = (ts: number | string | undefined, language: Language) => {
  if (ts === undefined || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

/** Friendly "add a key" state shown instead of an AI error. */
export const NoKeyPrompt: React.FC<{ t: T; onOpenSettings?: () => void }> = ({ t, onOpenSettings }) => (
  <div data-testid="paper-no-key" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
    <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-700" />
    <div className="flex-1">
      <p>{t.noKeyToast}</p>
      {onOpenSettings && (
        <button onClick={onOpenSettings} className="mt-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
          {t.openSettings}
        </button>
      )}
    </div>
  </div>
);

/** Classify an AI failure: missing key (show the friendly prompt) or a readable error message. */
export const describeAIError = (e: unknown, t: T): { noKey: boolean; message: string | null } => {
  if (isMissingApiKeyError(e)) return { noKey: true, message: null };
  const raw = e instanceof Error ? e.message : String(e);
  return { noKey: false, message: fmt(t.paperAIError, { msg: raw.length > 240 ? raw.slice(0, 240) + '…' : raw }) };
};

export const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{message}</div>
);

/** Keeps a rendering bug in the workspace from blanking the whole app. */
export class PaperErrorBoundary extends React.Component<
  { fallback: (reset: () => void) => React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Paper workspace crashed', error); }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
