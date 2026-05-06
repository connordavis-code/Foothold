import { describe, expect, it } from 'vitest';
import { humanizeDate } from './date';

const now = new Date('2026-05-06T12:00:00Z');

describe('humanizeDate', () => {
  it('returns "Today" for current day', () => {
    expect(humanizeDate('2026-05-06', now)).toBe('Today');
  });

  it('returns "Yesterday" for one day ago', () => {
    expect(humanizeDate('2026-05-05', now)).toBe('Yesterday');
  });

  it('returns weekday + date for 2-6 days ago', () => {
    expect(humanizeDate('2026-05-04', now)).toBe('Mon, May 4');
    expect(humanizeDate('2026-05-01', now)).toBe('Fri, May 1');
  });

  it('drops weekday past 7 days, keeps year if same', () => {
    expect(humanizeDate('2026-04-15', now)).toBe('Apr 15');
  });

  it('shows year when outside current year', () => {
    expect(humanizeDate('2025-12-15', now)).toBe('Dec 15, 2025');
  });

  it('returns the input string unchanged for malformed input', () => {
    expect(humanizeDate('not-a-date', now)).toBe('not-a-date');
  });

  it('handles UTC boundary without drifting', () => {
    // Late-night UTC moment, but still "today" in date terms
    const lateNight = new Date('2026-05-06T23:59:00Z');
    expect(humanizeDate('2026-05-06', lateNight)).toBe('Today');
    expect(humanizeDate('2026-05-05', lateNight)).toBe('Yesterday');
  });
});
