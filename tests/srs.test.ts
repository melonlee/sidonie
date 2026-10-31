import { describe, it, expect } from 'vitest';
import { scheduleReview, newSrsState, isDue, DAY_MS, MIN_EASE } from '../services/srs';

const NOW = Date.UTC(2026, 0, 1);

describe('scheduleReview', () => {
  it('follows 1 day, 3 days, then ease-factor growth on consecutive successes', () => {
    let s = scheduleReview(newSrsState(), true, NOW);
    expect(s.interval).toBe(1);
    expect(s.nextReview).toBe(NOW + DAY_MS);
    expect(s.streak).toBe(1);

    s = scheduleReview(s, true, NOW);
    expect(s.interval).toBe(3);
    expect(s.streak).toBe(2);

    const ease = s.easeFactor;
    s = scheduleReview(s, true, NOW);
    expect(s.interval).toBe(Math.round(3 * ease));
    expect(s.streak).toBe(3);
  });

  it('makes a missed item due immediately and lowers ease', () => {
    const learned = scheduleReview(scheduleReview(newSrsState(), true, NOW), true, NOW);
    const missed = scheduleReview(learned, false, NOW);
    expect(missed.interval).toBe(0);
    expect(missed.streak).toBe(0);
    expect(missed.nextReview).toBe(NOW);
    expect(missed.easeFactor).toBeCloseTo(learned.easeFactor - 0.2);
    expect(isDue(missed, NOW)).toBe(true);
  });

  it('never drops ease below the floor', () => {
    let s = newSrsState();
    for (let i = 0; i < 20; i++) s = scheduleReview(s, false, NOW);
    expect(s.easeFactor).toBe(MIN_EASE);
  });

  it('preserves extra fields (e.g. topicId / card data)', () => {
    const s = scheduleReview({ ...newSrsState(), topicId: 'fractions' }, true, NOW);
    expect(s.topicId).toBe('fractions');
  });

  it('treats new items as due and scheduled items as not yet due', () => {
    expect(isDue(newSrsState(), NOW)).toBe(true);
    expect(isDue(scheduleReview(newSrsState(), true, NOW), NOW + 1000)).toBe(false);
  });
});
