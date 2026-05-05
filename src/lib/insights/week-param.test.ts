import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveWeekParam } from './week-param';

describe('resolveWeekParam', () => {
  beforeAll(() => {
    // Freeze "today" at 2026-05-05 UTC for the future-date branch.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns null for undefined / empty input', () => {
    expect(resolveWeekParam(undefined)).toBeNull();
    expect(resolveWeekParam('')).toBeNull();
  });

  it('returns the date for a well-formed past YYYY-MM-DD', () => {
    expect(resolveWeekParam('2026-04-27')).toBe('2026-04-27');
    expect(resolveWeekParam('2026-01-01')).toBe('2026-01-01');
  });

  it('returns the date for today', () => {
    expect(resolveWeekParam('2026-05-05')).toBe('2026-05-05');
  });

  it('returns null for malformed strings', () => {
    expect(resolveWeekParam('foo')).toBeNull();
    expect(resolveWeekParam('2026/05/05')).toBeNull();
    expect(resolveWeekParam('2026-5-5')).toBeNull();
    expect(resolveWeekParam('05-05-2026')).toBeNull();
  });

  it('returns null for impossible calendar dates', () => {
    expect(resolveWeekParam('2026-13-01')).toBeNull();
    expect(resolveWeekParam('2026-02-30')).toBeNull();
    expect(resolveWeekParam('2026-13-99')).toBeNull();
  });

  it('returns null for future dates', () => {
    expect(resolveWeekParam('2026-05-06')).toBeNull();
    expect(resolveWeekParam('2099-01-01')).toBeNull();
  });
});
