// AI helpers for the paper workspace: prompts, context budgeting and output parsing.
import { DEFAULT_MODEL, THIRD_PARTY_MODELS } from '../../constants';
import { streamChatResponse } from '../../services/geminiService';
import { Role, type ApiKeys, type Language, type Message, type UserProfile } from '../../types';
import type { DocSection } from './types';

export interface AIContext { apiKeys: ApiKeys; userProfile: UserProfile }

/** Remove the app-wide <thought>/<plan> blocks (complete or still streaming) from a model answer. */
export function cleanModelText(raw: string): string {
  return raw
    .replace(/<(thought|plan)>[\s\S]*?<\/\1>/g, '')
    .replace(/^\s*<(thought|plan)>[\s\S]*$/, '')
    .trim();
}

const msg = (role: Role, text: string, i: number): Message => ({ id: `m${i}`, role, text, timestamp: Date.now() });

/** Stream a single prompt (optionally after earlier turns). `onChunk` receives the cleaned full text so far. */
export async function runAI(
  prompt: string,
  ctx: AIContext,
  onChunk?: (text: string) => void,
  history: { role: 'user' | 'model'; text: string }[] = [],
): Promise<string> {
  const messages: Message[] = [
    ...history.map((h, i) => msg(h.role === 'user' ? Role.USER : Role.MODEL, h.text, i)),
    msg(Role.USER, `${prompt}\n\n(Answer directly. Do not use <plan> or <thought> tags.)`, history.length),
  ];
  const full = await streamChatResponse(messages, t => onChunk?.(cleanModelText(t)), () => {}, DEFAULT_MODEL, false, ctx.apiKeys, ctx.userProfile);
  return cleanModelText(full);
}

/**
 * How much paper text (in characters) to send, based on the provider that will answer.
 * streamChatResponse uses Gemini when a Gemini key exists, otherwise the first configured third-party model.
 */
export function contextBudgetChars(apiKeys: ApiKeys): number {
  if (apiKeys.gemini?.trim()) return 240_000;
  const model = THIRD_PARTY_MODELS.find(m => apiKeys[m.provider as keyof ApiKeys]?.trim());
  if (!model) return 40_000;
  if (model.value.includes('8k')) return 12_000; // moonshot-v1-8k
  return 60_000; // DeepSeek / Qwen: 64k-128k token windows
}

const PRIORITY = /abstract|introduction|method|approach|model|architecture|experiment|result|evaluation|discussion|conclusion|limitation/i;

/** Truncate text to at most `max` chars, preferring paragraph and then sentence boundaries. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const para = cut.lastIndexOf('\n\n');
  if (para > max * 0.6) return cut.slice(0, para) + '\n…';
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1) + ' …';
  return cut + '…';
}

/**
 * Fit a paper into a character budget. Short sections are kept whole; long ones are trimmed
 * evenly (weighted water-filling, with key sections like method/results weighted 2x).
 * References are dropped.
 */
export function buildPaperContext(sections: DocSection[], budget: number): string {
  const items = sections
    .filter(s => !s.isReferences)
    .map(s => ({ title: s.title, text: s.paragraphs.map(p => p.text).join('\n\n'), weight: PRIORITY.test(s.title) ? 2 : 1 }))
    .filter(s => s.text);
  const header = (t: string) => (t ? `## ${t}\n` : '');
  const overhead = items.reduce((n, s) => n + header(s.title).length + 2, 0);
  let remaining = Math.max(0, budget - overhead);
  const alloc = new Map<number, number>();
  let open = items.map((_, i) => i);
  // water-filling: repeatedly give every open section its weighted share; sections that fit are closed
  while (open.length) {
    const totalW = open.reduce((n, i) => n + items[i].weight, 0);
    const fits = open.filter(i => items[i].text.length <= (remaining * items[i].weight) / totalW);
    if (!fits.length) {
      open.forEach(i => alloc.set(i, Math.floor((remaining * items[i].weight) / totalW)));
      break;
    }
    fits.forEach(i => { alloc.set(i, items[i].text.length); remaining -= items[i].text.length; });
    open = open.filter(i => !fits.includes(i));
  }
  return items
    .map((s, i) => `${header(s.title)}${truncateText(s.text, alloc.get(i) ?? 0)}`)
    .filter(s => s.trim())
    .join('\n\n');
}

export const targetLanguageName = (lang: Language) => (lang === 'zh' ? 'Simplified Chinese (简体中文)' : 'English');

export function analysisPrompt(title: string, context: string, basis: 'fulltext' | 'abstract', lang: Language): string {
  const zh = lang === 'zh';
  const h = zh
    ? ['TL;DR', '研究问题', '方法', '主要贡献', '实验与结果', '局限与开放问题', '读懂它需要的前置知识', '适合谁读']
    : ['TL;DR', 'Research question', 'Method', 'Key contributions', 'Experiments & results', 'Limitations & open questions', 'Prerequisites', 'Who should read this'];
  return `You are a patient research mentor helping someone study an academic paper.
Write a structured close reading of the paper below in ${targetLanguageName(lang)}, in Markdown, using exactly these level-2 headings in this order:
${h.map(x => `## ${x}`).join('\n')}

Guidelines:
- "${h[0]}": one or two plain sentences.
- Be concrete: name the datasets, metrics and numbers that the text actually reports. Never invent results.
- "${h[6]}": list the concepts a reader should know first, each with a one-line hint.
- "${h[7]}": who benefits and why; mention if it is a good entry point for beginners.
- Keep technical terms in English in parentheses where helpful.
${basis === 'abstract' ? '- Only the abstract is available: say so briefly under the method and results headings and do not speculate beyond it.\n' : ''}
Title: ${title}
${basis === 'fulltext' ? 'Paper text (extracted from PDF, may contain garbled formulas):' : 'Abstract:'}
"""
${context}
"""`;
}

export function translatePrompt(paragraphs: string[], lang: Language): string {
  return `Translate the following numbered paragraphs from an academic paper into ${targetLanguageName(lang)}.
- Translate faithfully and fluently for a student; keep technical terms accurate (you may add the English term in parentheses on first use).
- Keep math, symbols, citations like [12] and numbers unchanged.
- Output one block per paragraph, in the same order, each starting with its marker on its own line (e.g. [[1]]), and nothing else.

${paragraphs.map((p, i) => `[[${i + 1}]]\n${p}`).join('\n\n')}`;
}

/** Parse "[[1]] … [[2]] …" blocks (also while streaming: the last block may be partial). */
export function parseNumberedBlocks(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const re = /\[\[(\d+)\]\]/g;
  const marks: { n: number; at: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push({ n: Number(m[1]), at: m.index, end: m.index + m[0].length });
  marks.forEach((mk, i) => {
    const body = text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].at : undefined).trim();
    if (body) out.set(mk.n, body);
  });
  return out;
}

/** Group paragraphs into translation batches of at most `maxChars` source characters. */
export function batchParagraphs<T extends { text: string }>(paras: T[], maxChars = 5000): T[][] {
  const batches: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const p of paras) {
    if (cur.length && size + p.text.length > maxChars) { batches.push(cur); cur = []; size = 0; }
    cur.push(p);
    size += p.text.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function explainPrompt(selection: string, surrounding: string, title: string, lang: Language): string {
  return `I'm reading the paper "${title}". Explain the highlighted passage in ${targetLanguageName(lang)} for a motivated learner: what it means, why it matters here, and any term or notation in it. Be concise (under 150 words) and use the surrounding text for context.

Highlighted: """${selection}"""
Surrounding text: """${surrounding}"""`;
}

export function translateSelectionPrompt(selection: string, lang: Language): string {
  return `Translate this passage from an academic paper into ${targetLanguageName(lang)}. Output only the translation.\n\n"""${selection}"""`;
}

export function chatPrompt(question: string, title: string, passages: { label: string; section: string; text: string }[], lang: Language): string {
  return `You are helping someone study the paper "${title}". Answer the question using only the passages below.
- Cite the section for each claim like (§ Section name), using the section names given.
- If the passages don't contain the answer, say so plainly and suggest where in the paper to look.
- Answer in ${targetLanguageName(lang)} unless the question is clearly in another language.

${passages.map(p => `[${p.label}] Section: ${p.section || 'Front matter'}\n${p.text}`).join('\n\n')}

Question: ${question}`;
}

export function keywordPrompt(question: string): string {
  return `Rewrite this question about an English academic paper as 3-8 English search keywords (technical terms, likely words in the paper). Output only the keywords separated by spaces.\n\nQuestion: ${question}`;
}

export function flashcardPrompt(title: string, context: string, lang: Language): string {
  return `From the paper below, pick the 8-12 most important terms and concepts a learner should remember (methods, components, metrics, datasets, key ideas).
Return ONLY a JSON array, no prose, where each item is:
{"term": "<term as written in the paper>", "explanation": "<plain-language explanation in ${targetLanguageName(lang)}, 1-2 sentences>", "where": "<section name where it appears, and a few words of context>"}

Title: ${title}
"""
${context}
"""`;
}

export interface RawCard { term: string; explanation: string; where?: string }

/** Extract flashcards from a model answer (tolerates code fences and surrounding prose). */
export function parseFlashcards(text: string): RawCard[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(data)) return [];
    return data
      .filter(c => c && typeof c.term === 'string' && c.term.trim() && typeof c.explanation === 'string')
      .map(c => ({ term: c.term.trim(), explanation: c.explanation.trim(), where: typeof c.where === 'string' ? c.where.trim() : undefined }));
  } catch {
    return [];
  }
}

/** Body of the first `## heading` matching `pattern` in a Markdown document. */
export function extractMarkdownSection(md: string, pattern: RegExp): string {
  const lines = md.split('\n');
  const start = lines.findIndex(l => /^#{1,3}\s/.test(l) && pattern.test(l));
  if (start < 0) return '';
  const rest = lines.slice(start + 1);
  const next = rest.findIndex(l => /^#{1,3}\s/.test(l));
  return (next < 0 ? rest : rest.slice(0, next)).join('\n').trim();
}
