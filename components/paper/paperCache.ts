// Heavy per-paper data lives in IndexedDB (localStorage is ~5 MB and synchronous).
import { createStore, get, set, del, keys } from 'idb-keyval';
import type { ChatTurn, ExtractedDoc } from './types';

const db = createStore('sidonie-papers', 'cache');

export interface CachedAnalysis { text: string; lang: string; basis: 'fulltext' | 'abstract'; at: number }
export type CachedTranslations = Record<string, string>; // paraId -> translated text

const safeGet = async <T,>(key: string): Promise<T | undefined> => {
  try { return await get<T>(key, db); } catch (e) { console.warn('IndexedDB read failed', e); return undefined; }
};
const safeSet = async (key: string, value: unknown) => {
  try { await set(key, value, db); } catch (e) { console.warn('IndexedDB write failed', e); }
};

export const paperCache = {
  getDoc: (id: string) => safeGet<ExtractedDoc>(`doc:${id}`),
  setDoc: (id: string, doc: ExtractedDoc) => safeSet(`doc:${id}`, doc),
  getPdf: (id: string) => safeGet<ArrayBuffer>(`pdf:${id}`),
  setPdf: (id: string, data: ArrayBuffer) => safeSet(`pdf:${id}`, data),
  getAnalysis: (id: string) => safeGet<CachedAnalysis>(`analysis:${id}`),
  setAnalysis: (id: string, a: CachedAnalysis) => safeSet(`analysis:${id}`, a),
  getTranslations: (id: string, lang: string) => safeGet<CachedTranslations>(`tr:${id}:${lang}`),
  setTranslations: (id: string, lang: string, tr: CachedTranslations) => safeSet(`tr:${id}:${lang}`, tr),
  getChat: (id: string) => safeGet<ChatTurn[]>(`chat:${id}`),
  setChat: (id: string, turns: ChatTurn[]) => safeSet(`chat:${id}`, turns),
  /** Remove everything cached for a paper (when it leaves the reading list). */
  async clear(id: string) {
    try {
      const all = await keys(db);
      await Promise.all(all.filter(k => typeof k === 'string' && k.split(':')[1] === id).map(k => del(k, db)));
    } catch (e) { console.warn('IndexedDB cleanup failed', e); }
  },
};
