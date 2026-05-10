import { describe, expect, it } from 'vitest';
import { formatFreshness } from './freshness';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const now = new Date('2026-05-10T18:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * ONE_HOUR_MS);
const daysAgo = (d: number) => new Date(now.getTime() - d * ONE_DAY_MS);

describe('formatFreshness', () => {
  it('returns "No sources connected" when sources is empty', () => {
    expect(formatFreshness({ sources: [], now })).toEqual({
      headline: 'No sources connected',
      caveat: null,
    });
  });

  it('returns "Syncing · N sources" when all sources have lastSyncAt=null', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: null },
          { name: 'Wells Fargo', lastSyncAt: null },
        ],
        now,
      }),
    ).toEqual({
      headline: 'Syncing · 2 sources',
      caveat: 'Numbers will fill in shortly',
    });
  });

  it('returns "Syncing" branch when ANY source is never-synced', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: null },
        ],
        now,
      }).headline,
    ).toMatch(/^Syncing/);
  });

  it('returns "Fresh Nh ago · N sources" when all fresh (≤ 12h)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: hoursAgo(5) },
        ],
        now,
      }),
    ).toEqual({
      headline: 'Fresh 5h ago · 2 sources',
      caveat: null,
    });
  });

  it('uses age of OLDEST source (conservative anchor per Phase 5)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: minutesAgo(15) },
          { name: 'Wells Fargo', lastSyncAt: hoursAgo(8) },
        ],
        now,
      }).headline,
    ).toBe('Fresh 8h ago · 2 sources');
  });

  it('returns "Last sync Nd ago" when some sources stale (>12h, <7d)', () => {
    expect(
      formatFreshness({
        sources: [
          { name: 'Chase', lastSyncAt: hoursAgo(2) },
          { name: 'Wells Fargo', lastSyncAt: daysAgo(3) },
        ],
        now,
      }).headline,
    ).toMatch(/^Last sync 3d ago · 2 sources/);
  });

  it('singularizes source label when N=1', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: hoursAgo(2) }],
        now,
      }).headline,
    ).toBe('Fresh 2h ago · 1 source');
  });

  it('uses minutes for ages <1h', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: minutesAgo(8) }],
        now,
      }).headline,
    ).toBe('Fresh 8m ago · 1 source');
  });

  it('handles single never-synced source as Syncing', () => {
    expect(
      formatFreshness({
        sources: [{ name: 'Chase', lastSyncAt: null }],
        now,
      }),
    ).toEqual({
      headline: 'Syncing · 1 source',
      caveat: 'Numbers will fill in shortly',
    });
  });

  it('defaults now to Date.now() when not provided', () => {
    const result = formatFreshness({
      sources: [{ name: 'Chase', lastSyncAt: new Date() }],
    });
    expect(result.headline).toContain('source');
  });
});
