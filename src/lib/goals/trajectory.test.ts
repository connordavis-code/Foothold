import { describe, expect, it } from 'vitest';
import { walkBackTrajectory } from './trajectory';

describe('walkBackTrajectory', () => {
  it('returns flat anchor across the window when no deltas exist', () => {
    const series = walkBackTrajectory({
      anchor: 1000,
      dailyDelta: new Map(),
      today: new Date('2026-05-07T12:00:00Z'),
      days: 5,
    });
    expect(series).toEqual([
      { date: '2026-05-03', cumulative: 1000 },
      { date: '2026-05-04', cumulative: 1000 },
      { date: '2026-05-05', cumulative: 1000 },
      { date: '2026-05-06', cumulative: 1000 },
      { date: '2026-05-07', cumulative: 1000 },
    ]);
  });

  it('walks backward subtracting today-relative deltas (positive=outflow)', () => {
    // Anchor at 1000 today. A $100 outflow happened today (positive amount)
    // and a $50 inflow yesterday (negative amount). So:
    //   today        : 1000
    //   yesterday    : 1000 + 100 = 1100  (re-add the outflow)
    //   day-before   : 1100 - 50  = 1050  (un-do the inflow)
    const deltas = new Map<string, number>([
      ['2026-05-07', 100],
      ['2026-05-06', -50],
    ]);
    const series = walkBackTrajectory({
      anchor: 1000,
      dailyDelta: deltas,
      today: new Date('2026-05-07T12:00:00Z'),
      days: 3,
    });
    expect(series).toEqual([
      { date: '2026-05-05', cumulative: 1050 },
      { date: '2026-05-06', cumulative: 1100 },
      { date: '2026-05-07', cumulative: 1000 },
    ]);
  });

  it('returns just today when days=1', () => {
    const series = walkBackTrajectory({
      anchor: 500,
      dailyDelta: new Map([['2026-05-07', 50]]),
      today: new Date('2026-05-07T12:00:00Z'),
      days: 1,
    });
    expect(series).toEqual([{ date: '2026-05-07', cumulative: 500 }]);
  });
});
