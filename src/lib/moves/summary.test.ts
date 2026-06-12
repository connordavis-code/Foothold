import { describe, expect, it } from 'vitest';

import { formatMoveSummary } from './summary';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

const STREAMS = [
  { id: 'rent', merchantName: 'Landlord', description: 'Rent' },
  { id: 'gym', merchantName: null, description: 'Gym membership' },
] as unknown as RecurringStreamRow[];

const CATEGORIES = [{ key: 'FOOD_AND_DRINK', label: 'Food & drink' }];

describe('formatMoveSummary', () => {
  it('renders adjust-recurring with resolved stream name + window', () => {
    const s = formatMoveSummary(
      { templateKey: 'adjust-recurring', params: { streamId: 'rent', startMonth: '2026-06', endMonth: '2026-08', newAmount: 1200 } },
      STREAMS,
      CATEGORIES,
    );
    expect(s).toBe('Adjust Landlord to $1,200/mo from Jun 2026 to Aug 2026');
  });

  it('renders reduce-category with humanised label, no end window', () => {
    const s = formatMoveSummary(
      { templateKey: 'reduce-category', params: { categoryKey: 'FOOD_AND_DRINK', startMonth: '2026-06', deltaAmount: 100 } },
      STREAMS,
      CATEGORIES,
    );
    expect(s).toBe('Reduce Food & drink by $100/mo from Jun 2026');
  });

  it('renders income-event with + sign for positive amounts', () => {
    const s = formatMoveSummary(
      { templateKey: 'income-event', params: { startMonth: '2026-07', monthlyAmount: 500, label: 'Side gig' } },
      STREAMS,
      CATEGORIES,
    );
    expect(s).toBe('Side gig: +$500/mo from Jul 2026');
  });

  it('renders skip-once falling back to description when no merchantName', () => {
    const s = formatMoveSummary(
      { templateKey: 'skip-once', params: { streamId: 'gym', month: '2026-09' } },
      STREAMS,
      CATEGORIES,
    );
    expect(s).toBe('Skip Gym membership in Sep 2026');
  });

  it('falls back to (unknown stream) when the streamId no longer resolves', () => {
    const s = formatMoveSummary(
      { templateKey: 'skip-once', params: { streamId: 'deleted', month: '2026-09' } },
      STREAMS,
      CATEGORIES,
    );
    expect(s).toBe('Skip (unknown stream) in Sep 2026');
  });

  it('returns "Unknown move" for an unrecognised templateKey', () => {
    const s = formatMoveSummary({ templateKey: 'lump-sum', params: {} }, STREAMS, CATEGORIES);
    expect(s).toBe('Unknown move');
  });
});
