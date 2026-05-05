import { describe, expect, it } from 'vitest';
import { resolveButtonMode } from './button-mode';

describe('resolveButtonMode', () => {
  it('returns "generate" when no insight is displayed', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: false, isPastWeekView: false }),
    ).toBe('generate');
  });

  it('returns "regenerate" when displaying current/latest', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: true, isPastWeekView: false }),
    ).toBe('regenerate');
  });

  it('returns "back" when displaying a past week', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: true, isPastWeekView: true }),
    ).toBe('back');
  });

  // Defensive: this combo shouldn't occur (past-week views require a
  // resolved insight to display) but the resolver shouldn't blow up.
  it('returns "generate" for the impossible (no insight + past-week) state', () => {
    expect(
      resolveButtonMode({ hasDisplayedInsight: false, isPastWeekView: true }),
    ).toBe('generate');
  });
});
