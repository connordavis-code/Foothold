import { describe, expect, it } from 'vitest';
import { formatRelative, humanizeDate } from './date';

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

describe('formatRelative', () => {
  const NOW = new Date('2026-05-08T12:00:00Z');
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('< 1 minute → "just now"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 30_000), NOW)).toBe(
      'just now',
    );
  });

  it('exactly at "now" → "just now"', () => {
    expect(formatRelative(NOW, NOW)).toBe('just now');
  });

  // Defensive: clock skew on the client could surface a future
  // timestamp; readers should see "just now" rather than "-5m ago".
  it('future timestamp (clock skew) → "just now"', () => {
    expect(formatRelative(new Date(NOW.getTime() + HOUR), NOW)).toBe(
      'just now',
    );
  });

  it('5 minutes ago → "5m ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * MINUTE), NOW)).toBe(
      '5m ago',
    );
  });

  it('59 minutes → "59m ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 59 * MINUTE), NOW)).toBe(
      '59m ago',
    );
  });

  it('60 minutes → "1h ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 60 * MINUTE), NOW)).toBe(
      '1h ago',
    );
  });

  it('23 hours → "23h ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(
      '23h ago',
    );
  });

  it('24 hours → "yesterday"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 24 * HOUR), NOW)).toBe(
      'yesterday',
    );
  });

  it('3 days ago → "3d ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 3 * DAY), NOW)).toBe(
      '3d ago',
    );
  });

  it('6 days → "6d ago"', () => {
    expect(formatRelative(new Date(NOW.getTime() - 6 * DAY), NOW)).toBe(
      '6d ago',
    );
  });

  // 7+ days falls back to locale date — exact format depends on
  // system locale, so we just verify it's NOT a relative phrase.
  it('7+ days → locale date string', () => {
    const out = formatRelative(new Date(NOW.getTime() - 30 * DAY), NOW);
    expect(out).not.toMatch(/ago|yesterday|just now/);
    expect(out).toMatch(/\d/);
  });
});
