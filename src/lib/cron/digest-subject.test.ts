import { describe, expect, it } from 'vitest';
import { buildDigestSubject } from './digest-subject';

describe('buildDigestSubject', () => {
  it('returns "all clear" when nothing happened', () => {
    expect(buildDigestSubject({ errorCount: 0, warningCount: 0 })).toBe(
      'Foothold digest — all clear',
    );
  });

  // Regression for commit 00093bd — pre-fix this returned "all clear"
  // whenever errorCount === 0, hiding cron-miss warnings entirely.
  it('surfaces warnings even when zero errors (digest contract)', () => {
    expect(buildDigestSubject({ errorCount: 0, warningCount: 2 })).toBe(
      'Foothold digest — 2 warnings',
    );
  });

  it('renders single error in singular form', () => {
    expect(buildDigestSubject({ errorCount: 1, warningCount: 0 })).toBe(
      'Foothold digest — 1 error',
    );
  });

  it('renders multiple errors in plural form', () => {
    expect(buildDigestSubject({ errorCount: 3, warningCount: 0 })).toBe(
      'Foothold digest — 3 errors',
    );
  });

  it('renders single warning in singular form', () => {
    expect(buildDigestSubject({ errorCount: 0, warningCount: 1 })).toBe(
      'Foothold digest — 1 warning',
    );
  });

  it('combines errors and warnings with comma', () => {
    expect(buildDigestSubject({ errorCount: 2, warningCount: 1 })).toBe(
      'Foothold digest — 2 errors, 1 warning',
    );
  });
});
