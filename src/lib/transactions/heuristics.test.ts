import { describe, expect, it } from 'vitest';
import {
  findMirrorImageTransferPairs,
  type CandidateTransaction,
} from './heuristics';

const baseTxn = (
  partial: Partial<CandidateTransaction> & { id: string },
): CandidateTransaction => ({
  accountId: 'acct-A',
  date: '2026-05-10',
  amount: 0,
  isTransferOverride: null,
  ...partial,
});

describe('findMirrorImageTransferPairs', () => {
  it('returns no pairs for empty input', () => {
    expect(findMirrorImageTransferPairs([])).toEqual([]);
  });

  it('returns no pairs for a single transaction', () => {
    expect(
      findMirrorImageTransferPairs([
        baseTxn({ id: 't1', amount: 500, accountId: 'checking' }),
      ]),
    ).toEqual([]);
  });

  it('pairs a same-day mirror image across two accounts', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'out', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'in', amount: -500, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([{ outflowId: 'out', inflowId: 'in' }]);
  });

  it('pairs across a ±1 day window (outflow before inflow)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out',
        amount: 500,
        accountId: 'checking',
        date: '2026-05-10',
      }),
      baseTxn({
        id: 'in',
        amount: -500,
        accountId: 'brokerage',
        date: '2026-05-11',
      }),
    ]);
    expect(result).toEqual([{ outflowId: 'out', inflowId: 'in' }]);
  });

  it('pairs across a ±1 day window (inflow before outflow)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out',
        amount: 500,
        accountId: 'checking',
        date: '2026-05-11',
      }),
      baseTxn({
        id: 'in',
        amount: -500,
        accountId: 'brokerage',
        date: '2026-05-10',
      }),
    ]);
    expect(result).toEqual([{ outflowId: 'out', inflowId: 'in' }]);
  });

  it('does NOT pair when txns are >1 day apart', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out',
        amount: 500,
        accountId: 'checking',
        date: '2026-05-10',
      }),
      baseTxn({
        id: 'in',
        amount: -500,
        accountId: 'brokerage',
        date: '2026-05-12',
      }),
    ]);
    expect(result).toEqual([]);
  });

  it('does NOT pair txns on the same account (ledger entries, not transfers)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'a', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'b', amount: -500, accountId: 'checking' }),
    ]);
    expect(result).toEqual([]);
  });

  it('pairs amounts within $0.01 tolerance (rounding noise)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'out', amount: 500.01, accountId: 'checking' }),
      baseTxn({ id: 'in', amount: -500.0, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([{ outflowId: 'out', inflowId: 'in' }]);
  });

  it('does NOT pair amounts that drift beyond $0.01', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'out', amount: 500.02, accountId: 'checking' }),
      baseTxn({ id: 'in', amount: -500.0, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([]);
  });

  it('skips outflow if it already has a user override (true)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out',
        amount: 500,
        accountId: 'checking',
        isTransferOverride: true,
      }),
      baseTxn({ id: 'in', amount: -500, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([]);
  });

  it('skips outflow if user override is explicitly false (not a transfer)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out',
        amount: 500,
        accountId: 'checking',
        isTransferOverride: false,
      }),
      baseTxn({ id: 'in', amount: -500, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([]);
  });

  it('skips inflow if it already has a user override', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'out', amount: 500, accountId: 'checking' }),
      baseTxn({
        id: 'in',
        amount: -500,
        accountId: 'brokerage',
        isTransferOverride: true,
      }),
    ]);
    expect(result).toEqual([]);
  });

  it('does NOT pair two outflows (no inflow counterpart)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'a', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'b', amount: 500, accountId: 'savings' }),
    ]);
    expect(result).toEqual([]);
  });

  it('pairs greedily so each transaction is claimed at most once', () => {
    // Three identical outflows, one inflow → exactly one pair.
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'out-1', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'out-2', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'out-3', amount: 500, accountId: 'checking' }),
      baseTxn({ id: 'in', amount: -500, accountId: 'brokerage' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.inflowId).toBe('in');
  });

  it('produces deterministic output (sorted by outflow date then id)', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({
        id: 'out-late',
        amount: 100,
        accountId: 'checking',
        date: '2026-05-11',
      }),
      baseTxn({
        id: 'in-late',
        amount: -100,
        accountId: 'brokerage',
        date: '2026-05-11',
      }),
      baseTxn({
        id: 'out-early',
        amount: 200,
        accountId: 'checking',
        date: '2026-05-09',
      }),
      baseTxn({
        id: 'in-early',
        amount: -200,
        accountId: 'brokerage',
        date: '2026-05-09',
      }),
    ]);
    expect(result).toEqual([
      { outflowId: 'out-early', inflowId: 'in-early' },
      { outflowId: 'out-late', inflowId: 'in-late' },
    ]);
  });

  it('skips zero-amount transactions', () => {
    const result = findMirrorImageTransferPairs([
      baseTxn({ id: 'zero-out', amount: 0, accountId: 'checking' }),
      baseTxn({ id: 'zero-in', amount: 0, accountId: 'brokerage' }),
    ]);
    expect(result).toEqual([]);
  });
});
