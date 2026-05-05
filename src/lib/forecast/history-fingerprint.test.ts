import { describe, expect, it } from 'vitest';
import { buildInputHash, computeHistoryFingerprint } from './history-fingerprint';
import type { ScenarioOverrides } from './types';

describe('computeHistoryFingerprint', () => {
  it('returns a deterministic string for the same inputs', () => {
    const inputs = {
      todayUtc: '2026-05-05',
      transactionCount: 142,
      latestTransactionDate: '2026-05-04',
      latestSyncDate: '2026-05-05',
    };
    expect(computeHistoryFingerprint(inputs)).toBe(
      computeHistoryFingerprint(inputs),
    );
  });

  it('changes when the calendar day rolls over', () => {
    const a = computeHistoryFingerprint({
      todayUtc: '2026-05-05',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    const b = computeHistoryFingerprint({
      todayUtc: '2026-05-06',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    expect(a).not.toBe(b);
  });

  it('changes when transaction count changes', () => {
    const base = {
      todayUtc: '2026-05-05',
      latestTransactionDate: '2026-05-04',
      latestSyncDate: '2026-05-05',
    };
    expect(computeHistoryFingerprint({ ...base, transactionCount: 100 }))
      .not.toBe(computeHistoryFingerprint({ ...base, transactionCount: 101 }));
  });

  it('changes when latest transaction date changes', () => {
    const base = {
      todayUtc: '2026-05-05',
      transactionCount: 100,
      latestSyncDate: '2026-05-05',
    };
    expect(
      computeHistoryFingerprint({ ...base, latestTransactionDate: '2026-05-04' }),
    ).not.toBe(
      computeHistoryFingerprint({ ...base, latestTransactionDate: '2026-05-03' }),
    );
  });

  it('handles null latestTransactionDate gracefully', () => {
    const result = computeHistoryFingerprint({
      todayUtc: '2026-05-05',
      transactionCount: 0,
      latestTransactionDate: null,
      latestSyncDate: null,
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('buildInputHash', () => {
  it('produces a stable SHA-256 hex string', () => {
    const overrides: ScenarioOverrides = { categoryDeltas: [{ categoryId: 'a', monthlyDelta: -50 }] };
    const fp = '2026-05-05|tx:100|latest:2026-05-04|sync:2026-05-05';
    const hash = buildInputHash(overrides, fp);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns the same hash for identical inputs', () => {
    const overrides: ScenarioOverrides = { incomeDelta: { monthlyDelta: 100 } };
    const fp = 'fp1';
    expect(buildInputHash(overrides, fp)).toBe(buildInputHash(overrides, fp));
  });

  it('returns a different hash when overrides change', () => {
    const fp = 'fp1';
    const a = buildInputHash({ incomeDelta: { monthlyDelta: 100 } }, fp);
    const b = buildInputHash({ incomeDelta: { monthlyDelta: 200 } }, fp);
    expect(a).not.toBe(b);
  });

  it('returns a different hash when fingerprint changes', () => {
    const overrides: ScenarioOverrides = { incomeDelta: { monthlyDelta: 100 } };
    const a = buildInputHash(overrides, 'fp1');
    const b = buildInputHash(overrides, 'fp2');
    expect(a).not.toBe(b);
  });
});
