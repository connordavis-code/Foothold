import { describe, it, expect } from 'vitest';
import {
  applyIncomeChange,
  applyBigPurchase,
  applyPayRaise,
  applyJobLoss,
  applyNewRecurring,
  applyPauseRecurring,
  applyBonus,
  applyCancelSub,
} from './appliers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

describe('applyIncomeChange', () => {
  it('sets incomeDelta on an empty scenario', () => {
    const next = applyIncomeChange(
      { when: '2026-07', newMonthlyAmount: 500 },
      {},
    );
    expect(next.incomeDelta).toEqual({ monthlyDelta: 500, startMonth: '2026-07' });
  });

  it('overwrites existing incomeDelta (last-wins)', () => {
    const next = applyIncomeChange(
      { when: '2026-08', newMonthlyAmount: -200 },
      { incomeDelta: { monthlyDelta: 500, startMonth: '2026-07' } },
    );
    expect(next.incomeDelta).toEqual({ monthlyDelta: -200, startMonth: '2026-08' });
  });
});

describe('applyBigPurchase', () => {
  it('appends a negative lump sum', () => {
    const next = applyBigPurchase({ when: '2026-09', amount: 4000 }, {});
    expect(next.lumpSums).toHaveLength(1);
    expect(next.lumpSums![0]).toMatchObject({
      label: 'Big purchase',
      amount: -4000,
      month: '2026-09',
    });
    expect(next.lumpSums![0].id).toBeTruthy();
  });

  it('coexists with existing lump sums', () => {
    const next = applyBigPurchase(
      { when: '2026-10', amount: 1000 },
      { lumpSums: [{ id: 'a', label: 'Old', amount: -500, month: '2026-07' }] },
    );
    expect(next.lumpSums).toHaveLength(2);
  });
});

describe('applyPayRaise', () => {
  it('sets incomeDelta with positive monthlyDelta', () => {
    const next = applyPayRaise({ when: '2026-08', increaseMonthly: 800 }, {});
    expect(next.incomeDelta).toEqual({ monthlyDelta: 800, startMonth: '2026-08' });
  });
});

describe('applyJobLoss', () => {
  it('sets incomeDelta to negative average + bounded by months', () => {
    const next = applyJobLoss(
      { when: '2026-09', months: 3, currentMonthlyIncome: 5000 },
      {},
    );
    expect(next.incomeDelta).toEqual({
      monthlyDelta: -5000,
      startMonth: '2026-09',
      endMonth: '2026-11',
    });
  });

  it('omits endMonth when months is 0 (permanent)', () => {
    const next = applyJobLoss(
      { when: '2026-09', months: 0, currentMonthlyIncome: 5000 },
      {},
    );
    expect(next.incomeDelta).toEqual({
      monthlyDelta: -5000,
      startMonth: '2026-09',
    });
  });
});

describe('applyNewRecurring', () => {
  it('appends a recurring add', () => {
    const next = applyNewRecurring(
      { when: '2026-07', amount: 50, name: 'New gym', direction: 'outflow' },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      action: 'add',
      label: 'New gym',
      amount: 50,
      direction: 'outflow',
      cadence: 'monthly',
      startMonth: '2026-07',
    });
  });
});

describe('applyPauseRecurring', () => {
  it('appends a bounded pause', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-1', startMonth: '2026-07', months: 3 },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-07',
      endMonth: '2026-09',
    });
  });

  it('dedupes by streamId (updates existing pause for same stream)', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-1', startMonth: '2026-08', months: 1 },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-09' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      startMonth: '2026-08',
      endMonth: '2026-08',
    });
  });

  it('preserves unrelated existing changes', () => {
    const next = applyPauseRecurring(
      { streamId: 'stream-2', startMonth: '2026-09', months: 2 },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-08' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(2);
  });
});

describe('applyBonus', () => {
  it('appends a positive lump sum', () => {
    const next = applyBonus({ when: '2026-12', amount: 2000 }, {});
    expect(next.lumpSums).toHaveLength(1);
    expect(next.lumpSums![0]).toMatchObject({
      label: 'Bonus',
      amount: 2000,
      month: '2026-12',
    });
  });
});

describe('applyCancelSub', () => {
  it('appends a permanent pause (startMonth set, endMonth omitted)', () => {
    const next = applyCancelSub(
      { streamId: 'stream-1', startMonth: '2026-07' },
      {},
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-07',
    });
    expect(next.recurringChanges![0].endMonth).toBeUndefined();
  });

  it('dedupes by streamId', () => {
    const next = applyCancelSub(
      { streamId: 'stream-1', startMonth: '2026-08' },
      {
        recurringChanges: [
          { streamId: 'stream-1', action: 'pause', startMonth: '2026-07', endMonth: '2026-09' },
        ],
      },
    );
    expect(next.recurringChanges).toHaveLength(1);
    expect(next.recurringChanges![0]).toMatchObject({
      streamId: 'stream-1',
      action: 'pause',
      startMonth: '2026-08',
    });
    expect(next.recurringChanges![0].endMonth).toBeUndefined();
  });
});
