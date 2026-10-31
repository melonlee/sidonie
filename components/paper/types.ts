import type { SrsState } from '../../services/srs';

export type PaperStatus = 'toread' | 'reading' | 'read';
export const PAPER_STATUSES: PaperStatus[] = ['toread', 'reading', 'read'];

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';
export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

/** A highlighted span inside one paragraph of the reading view. Offsets are character offsets in the paragraph text. */
export interface Highlight {
  id: string;
  paraId: string;
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
  note?: string;
  sectionTitle?: string;
  createdAt: number;
}

/** A paper in the reading list. Heavy data (full text, translations, analysis, chat) lives in IndexedDB. */
export interface SavedPaper {
  id: string; // arXiv id without version (e.g. "1706.03762"), or "local-…" for imported PDFs
  source: 'arxiv' | 'local';
  arxivVersion?: string; // e.g. "v7"
  title: string;
  authors: string[];
  summary: string;
  publishedAt?: string; // ISO date
  category?: string;
  link?: string;
  pdfLink?: string;
  status: PaperStatus;
  tags: string[];
  addedAt: number;
  lastOpenedAt?: number;
  readAt?: number; // when it was last marked as read
  notes: string; // my markdown notes
  highlights: Highlight[];
  hasFullText?: boolean; // full text is cached in IndexedDB
  needsMetadata?: boolean; // added by ID while the arXiv API was unreachable; filled in later
}

export interface Flashcard extends SrsState {
  id: string;
  paperId: string;
  term: string;
  explanation: string;
  where?: string; // section / context where it appears
  createdAt: number;
}

export interface PaperStudyStore {
  version: 1;
  papers: SavedPaper[];
  cards: Flashcard[];
  activityDays: string[]; // local YYYY-MM-DD days with study activity (for streaks)
}

/** One paragraph of the reading view. */
export interface DocParagraph {
  id: string; // stable within a document: "a-p0" (abstract) or "f-s2-p3" (full text)
  text: string;
}

export interface DocSection {
  id: string;
  title: string;
  paragraphs: DocParagraph[];
  isReferences?: boolean;
}

/** Full text extracted from a PDF, cached per paper. */
export interface ExtractedDoc {
  sections: DocSection[];
  pageCount: number;
  source: 'arxiv' | 'upload';
  extractedAt: number;
  pdfTitle?: string;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
  sources?: string[]; // section titles the answer was grounded on
  at: number;
}
