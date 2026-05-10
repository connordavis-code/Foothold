import { describe, expect, it } from 'vitest';
import { deriveSnapshotKeys } from './snapshot';

describe('deriveSnapshotKeys', () => {
  it('returns YYYY-MM and YYYY-MM-DD slices of the UTC ISO string', () => {
    expect(deriveSnapshotKeys(new Date('2026-05-09T11:00:00.000Z'))).toEqual({
      currentMonth: '2026-05',
      snapshotDate: '2026-05-09',
    });
  });

  it('handles UTC midnight cleanly — last-second of day vs first-second of next', () => {
    expect(deriveSnapshotKeys(new Date('2026-05-09T23:59:59.999Z'))).toEqual({
      currentMonth: '2026-05',
      snapshotDate: '2026-05-09',
    });
    expect(deriveSnapshotKeys(new Date('2026-05-10T00:00:00.000Z'))).toEqual({
      currentMonth: '2026-05',
      snapshotDate: '2026-05-10',
    });
  });

  it('anchors in UTC — a PT-evening input that crosses UTC midnight rolls to next day', () => {
    // 5pm PT on May 9 = midnight UTC on May 10.
    // The cron's snapshotDate is the UTC date, not the user's local date.
    expect(
      deriveSnapshotKeys(new Date('2026-05-09T17:00:00.000-07:00')),
    ).toEqual({
      currentMonth: '2026-05',
      snapshotDate: '2026-05-10',
    });
  });

  it('rolls month boundary cleanly', () => {
    expect(deriveSnapshotKeys(new Date('2026-05-31T23:59:59.999Z'))).toEqual({
      currentMonth: '2026-05',
      snapshotDate: '2026-05-31',
    });
    expect(deriveSnapshotKeys(new Date('2026-06-01T00:00:00.000Z'))).toEqual({
      currentMonth: '2026-06',
      snapshotDate: '2026-06-01',
    });
  });

  it('rolls year boundary cleanly', () => {
    expect(deriveSnapshotKeys(new Date('2026-12-31T23:59:59.999Z'))).toEqual({
      currentMonth: '2026-12',
      snapshotDate: '2026-12-31',
    });
    expect(deriveSnapshotKeys(new Date('2027-01-01T00:00:00.000Z'))).toEqual({
      currentMonth: '2027-01',
      snapshotDate: '2027-01-01',
    });
  });
});
