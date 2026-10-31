// Spaced-repetition scheduling shared by Help Child (topic reviews) and Paper Radar (flashcards).
// A simplified SM-2: first success -> 1 day, second -> 3 days, then the interval grows by the
// ease factor. A miss resets the streak and makes the item due again right away.

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsState {
  lastReviewed: number; // timestamp, 0 = never
  nextReview: number; // timestamp, 0 = due now
  interval: number; // days
  easeFactor: number; // SM-2 ease factor
  streak: number; // consecutive correct answers
}

export const MIN_EASE = 1.3;
export const MAX_EASE = 5.0;

export const newSrsState = (): SrsState => ({
  lastReviewed: 0,
  nextReview: 0,
  interval: 0,
  easeFactor: 2.5,
  streak: 0,
});

/** Next schedule after answering an item correctly or not. Pure: `now` is injectable for tests. */
export function scheduleReview<T extends SrsState>(current: T, isCorrect: boolean, now: number = Date.now()): T {
  let { interval, easeFactor, streak } = current;

  if (isCorrect) {
    if (streak === 0) interval = 1;
    else if (streak === 1) interval = 3;
    else interval = Math.round(interval * easeFactor);
    streak += 1;
    easeFactor = Math.min(easeFactor + 0.1, MAX_EASE);
  } else {
    streak = 0;
    interval = 0; // comes back right away
    easeFactor = Math.max(easeFactor - 0.2, MIN_EASE);
  }

  return {
    ...current,
    lastReviewed: now,
    nextReview: now + interval * DAY_MS,
    interval,
    easeFactor,
    streak,
  };
}

export const isDue = (s: Pick<SrsState, 'nextReview'>, now: number = Date.now()) => now >= s.nextReview;
