import { describe, expect, it } from 'vitest';
import { pickTopDiscretionaryCategory } from './discretionary';

const buckets = ['2026-02', '2026-03', '2026-04'];

describe('pickTopDiscretionaryCategory', () => {
  it('returns null on empty rows', () => {
    expect(pickTopDiscretionaryCategory([], buckets)).toBeNull();
  });

  it('returns null when monthBuckets is empty even with rows', () => {
    expect(
      pickTopDiscretionaryCategory(
        [{ category: 'FOOD', ym: '2026-03', monthTotal: 100 }],
        [],
      ),
    ).toBeNull();
  });

  it('demotes a one-off big purchase below a steadier smaller category', () => {
    // Furniture: $900 in March only — sorted [0, 0, 900] → median 0.
    // Food:     $200 every month — sorted [200, 200, 200] → median 200.
    // Food wins despite the smaller absolute figure.
    const result = pickTopDiscretionaryCategory(
      [
        { category: 'FURNITURE', ym: '2026-03', monthTotal: 900 },
        { category: 'FOOD', ym: '2026-02', monthTotal: 200 },
        { category: 'FOOD', ym: '2026-03', monthTotal: 200 },
        { category: 'FOOD', ym: '2026-04', monthTotal: 200 },
      ],
      buckets,
    );
    expect(result).toEqual({ name: 'FOOD', monthlyAmount: 200 });
  });

  it('takes the middle value for an odd-length bucket list', () => {
    // [0, 100, 300] → median 100.
    const result = pickTopDiscretionaryCategory(
      [
        { category: 'X', ym: '2026-03', monthTotal: 100 },
        { category: 'X', ym: '2026-04', monthTotal: 300 },
      ],
      buckets,
    );
    expect(result).toEqual({ name: 'X', monthlyAmount: 100 });
  });

  it('averages the two middle values for an even-length bucket list', () => {
    // 4 buckets, presence in 2: [0, 0, 100, 300] → median (0+100)/2 = 50.
    const result = pickTopDiscretionaryCategory(
      [
        { category: 'X', ym: '2026-03', monthTotal: 100 },
        { category: 'X', ym: '2026-04', monthTotal: 300 },
      ],
      ['2026-01', '2026-02', '2026-03', '2026-04'],
    );
    expect(result).toEqual({ name: 'X', monthlyAmount: 50 });
  });

  it('skips rows whose ym is outside monthBuckets', () => {
    const result = pickTopDiscretionaryCategory(
      [
        { category: 'X', ym: '2025-01', monthTotal: 9999 }, // outside window
        { category: 'X', ym: '2026-03', monthTotal: 100 },
      ],
      buckets,
    );
    // Only March counted: [0, 0, 100] → median 0 → not returned (a single
    // month of activity isn't "steady discretionary").
    expect(result).toBeNull();
  });

  it('skips rows with null category', () => {
    expect(
      pickTopDiscretionaryCategory(
        [{ category: null, ym: '2026-03', monthTotal: 999 }],
        buckets,
      ),
    ).toBeNull();
  });

  it('returns null when every category is a one-off (all medians = 0)', () => {
    // Each category appears in exactly one bucket — all medians are 0.
    // No category qualifies as "steady discretionary." Returning a $0/mo
    // category here would produce "Trim X at $0/mo" — explicitly avoided.
    const result = pickTopDiscretionaryCategory(
      [
        { category: 'FURNITURE', ym: '2026-03', monthTotal: 900 },
        { category: 'TRAVEL', ym: '2026-04', monthTotal: 500 },
      ],
      buckets,
    );
    expect(result).toBeNull();
  });
});
