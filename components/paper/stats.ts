import { DAY_MS, isDue } from '../../services/srs';
import type { Flashcard, SavedPaper } from './types';

/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Consecutive days with study activity, ending today — or yesterday, so a streak isn't
 * shown as broken before you've studied today.
 */
export const computeStreak = (activityDays: string[], now: number = Date.now()): number => {
  const days = new Set(activityDays);
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1); // calendar-aware (DST safe)
  }
  return streak;
};

/** Papers marked as read within the last 7 days. */
export const papersReadThisWeek = (papers: SavedPaper[], now: number = Date.now()) =>
  papers.filter(p => p.status === 'read' && p.readAt !== undefined && now - p.readAt < 7 * DAY_MS && p.readAt <= now).length;

export const dueCards = (cards: Flashcard[], now: number = Date.now()) => cards.filter(c => isDue(c, now));
