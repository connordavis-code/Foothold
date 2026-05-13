import { describe, it, expect } from 'vitest';
import { statePillKind } from './state-pill-kind';

describe('statePillKind — restraint matrix', () => {
  it('returns caution for degraded', () => {
    expect(statePillKind('degraded')).toBe('caution');
  });

  it('returns caution for needs_reconnect', () => {
    expect(statePillKind('needs_reconnect')).toBe('caution');
  });

  it('returns destructive for failed', () => {
    expect(statePillKind('failed')).toBe('destructive');
  });

  it('returns null for healthy (silence rule)', () => {
    expect(statePillKind('healthy')).toBe(null);
  });

  it('returns null for stale (silence rule)', () => {
    expect(statePillKind('stale')).toBe(null);
  });

  it('returns null for unknown (silence rule)', () => {
    expect(statePillKind('unknown')).toBe(null);
  });

  it('returns null for syncing (silence rule)', () => {
    expect(statePillKind('syncing')).toBe(null);
  });
});
