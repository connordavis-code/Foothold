import { describe, expect, it } from 'vitest';
import { groupByDate } from './group-by-date';

describe('groupByDate', () => {
  it('groups rows by date key in insertion order', () => {
    const rows = [
      { id: 'a', d: '2026-05-06' },
      { id: 'b', d: '2026-05-06' },
      { id: 'c', d: '2026-05-05' },
      { id: 'd', d: '2026-05-04' },
      { id: 'e', d: '2026-05-04' },
    ];
    const sections = groupByDate(rows, (r) => r.d);
    expect(sections).toEqual([
      { dateKey: '2026-05-06', items: [rows[0], rows[1]] },
      { dateKey: '2026-05-05', items: [rows[2]] },
      { dateKey: '2026-05-04', items: [rows[3], rows[4]] },
    ]);
  });

  it('preserves caller-driven order across non-contiguous keys', () => {
    // We do not re-sort; queries return desc, we trust that order.
    const rows = [
      { id: '1', d: '2026-05-06' },
      { id: '2', d: '2026-05-04' },
      { id: '3', d: '2026-05-06' }, // appears after 05-04 → still re-bucketed under 05-06
    ];
    const sections = groupByDate(rows, (r) => r.d);
    expect(sections.map((s) => s.dateKey)).toEqual(['2026-05-06', '2026-05-04']);
    expect(sections[0].items.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('returns empty array for empty input', () => {
    expect(groupByDate([], () => '2026-05-06')).toEqual([]);
  });
});
