import { describe, expect, it } from 'vitest';
import { formatWeekRange } from './format-week-range';

describe('formatWeekRange', () => {
  it('includes the year on the end by default', () => {
    expect(formatWeekRange('2026-04-27', '2026-05-03')).toMatch(/Apr 27 – May 3, 2026/);
  });

  it('omits the year when includeYear is false', () => {
    const out = formatWeekRange('2026-04-27', '2026-05-03', { includeYear: false });
    expect(out).toMatch(/Apr 27 – May 3$/);
    expect(out).not.toContain('2026');
  });

  it('handles same-month ranges', () => {
    expect(formatWeekRange('2026-05-04', '2026-05-10')).toMatch(/May 4 – May 10, 2026/);
  });

  it('does not shift the day for west-of-UTC locales (ISO anchored to UTC midnight)', () => {
    // The fact that we explicitly pass `timeZone: 'UTC'` means the
    // formatted day equals the input day regardless of the runtime TZ.
    // Spot-check the boundary days.
    expect(formatWeekRange('2026-01-01', '2026-01-07')).toMatch(/Jan 1 – Jan 7, 2026/);
  });
});
