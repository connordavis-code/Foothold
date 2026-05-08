import { describe, expect, it } from 'vitest';
import { summarizeTrustStrip } from './trust-strip';
import type { SourceHealth } from '@/lib/db/queries/health';

type Fixture = Pick<
  SourceHealth,
  'itemId' | 'institutionName' | 'state' | 'reason' | 'lastSuccessfulSyncAt'
>;

const t = (iso: string) => new Date(iso);

const wf = (overrides: Partial<Fixture> = {}): Fixture => ({
  itemId: 'wf',
  institutionName: 'Wells Fargo',
  state: 'healthy',
  reason: 'All applicable capabilities fresh',
  lastSuccessfulSyncAt: t('2026-05-07T15:00:00Z'),
  ...overrides,
});

const amex = (overrides: Partial<Fixture> = {}): Fixture => ({
  itemId: 'amex',
  institutionName: 'American Express',
  state: 'healthy',
  reason: 'All applicable capabilities fresh',
  lastSuccessfulSyncAt: t('2026-05-07T14:30:00Z'),
  ...overrides,
});

const fid = (overrides: Partial<Fixture> = {}): Fixture => ({
  itemId: 'fid',
  institutionName: 'Fidelity',
  state: 'healthy',
  reason: 'All applicable capabilities fresh',
  lastSuccessfulSyncAt: t('2026-05-07T13:00:00Z'),
  ...overrides,
});

describe('summarizeTrustStrip — healthy', () => {
  it('all healthy → kind=healthy, oldest lastSuccessfulSyncAt as anchor', () => {
    const r = summarizeTrustStrip([wf(), amex(), fid()]);
    expect(r.kind).toBe('healthy');
    if (r.kind !== 'healthy') return;
    expect(r.sourceCount).toBe(3);
    // Conservative: oldest of (15:00, 14:30, 13:00) = 13:00
    expect(r.freshAt.toISOString()).toBe('2026-05-07T13:00:00.000Z');
  });

  it('healthy + stale + unknown → still kind=healthy (silent for non-elevated)', () => {
    const r = summarizeTrustStrip([
      wf(),
      amex({ state: 'stale', reason: '1 of 3 capabilities not fresh' }),
      fid({
        state: 'unknown',
        reason: 'No sync data yet',
        lastSuccessfulSyncAt: null,
      }),
    ]);
    expect(r.kind).toBe('healthy');
    if (r.kind !== 'healthy') return;
    expect(r.sourceCount).toBe(3);
    // Only sources with non-null lastSuccessfulSyncAt anchor freshAt
    expect(r.freshAt.toISOString()).toBe('2026-05-07T14:30:00.000Z');
  });

  it('single healthy source with lastSuccessfulSyncAt → freshAt is that timestamp', () => {
    const r = summarizeTrustStrip([wf()]);
    expect(r.kind).toBe('healthy');
    if (r.kind !== 'healthy') return;
    expect(r.sourceCount).toBe(1);
    expect(r.freshAt.toISOString()).toBe('2026-05-07T15:00:00.000Z');
  });
});

describe('summarizeTrustStrip — no_signal', () => {
  it('all unknown with null lastSuccessfulSyncAt → kind=no_signal', () => {
    const r = summarizeTrustStrip([
      wf({
        state: 'unknown',
        reason: 'No sync data yet',
        lastSuccessfulSyncAt: null,
      }),
      amex({
        state: 'unknown',
        reason: 'No sync data yet',
        lastSuccessfulSyncAt: null,
      }),
    ]);
    expect(r.kind).toBe('no_signal');
    if (r.kind !== 'no_signal') return;
    expect(r.sourceCount).toBe(2);
  });

  it('mix of stale + unknown all with null lastSuccessfulSyncAt → no_signal', () => {
    const r = summarizeTrustStrip([
      wf({
        state: 'stale',
        reason: '2 of 3 capabilities never synced',
        lastSuccessfulSyncAt: null,
      }),
      amex({
        state: 'unknown',
        reason: 'No sync data yet',
        lastSuccessfulSyncAt: null,
      }),
    ]);
    expect(r.kind).toBe('no_signal');
  });
});

describe('summarizeTrustStrip — elevated', () => {
  it('one degraded source → kind=elevated, only the degraded source listed', () => {
    const r = summarizeTrustStrip([
      wf(),
      amex({
        state: 'degraded',
        reason: '1 of 3 capabilities failing — transactions: rate_limit',
      }),
      fid(),
    ]);
    expect(r.kind).toBe('elevated');
    if (r.kind !== 'elevated') return;
    expect(r.sourceCount).toBe(3);
    expect(r.elevated).toHaveLength(1);
    expect(r.elevated[0].institutionName).toBe('American Express');
    expect(r.elevated[0].reason).toContain('1 of 3 capabilities failing');
  });

  it('multiple elevated of mixed kinds → all surface, in input order', () => {
    const r = summarizeTrustStrip([
      wf({
        state: 'failed',
        reason: 'All 4 applicable capabilities failing',
      }),
      amex({
        state: 'needs_reconnect',
        reason: 'Reconnect required',
      }),
      fid(),
    ]);
    expect(r.kind).toBe('elevated');
    if (r.kind !== 'elevated') return;
    expect(r.elevated.map((e) => e.institutionName)).toEqual([
      'Wells Fargo',
      'American Express',
    ]);
  });

  it('every source elevated → all listed; sourceCount matches elevated length', () => {
    const r = summarizeTrustStrip([
      wf({ state: 'failed', reason: 'failed' }),
      amex({ state: 'degraded', reason: 'degraded' }),
    ]);
    expect(r.kind).toBe('elevated');
    if (r.kind !== 'elevated') return;
    expect(r.sourceCount).toBe(2);
    expect(r.elevated).toHaveLength(2);
  });

  it('elevated source with null institutionName → falls back to "Unknown institution"', () => {
    const r = summarizeTrustStrip([
      wf({
        institutionName: null,
        state: 'failed',
        reason: 'All 1 applicable capabilities failing',
      }),
    ]);
    expect(r.kind).toBe('elevated');
    if (r.kind !== 'elevated') return;
    expect(r.elevated[0].institutionName).toBe('Unknown institution');
  });

  it('elevated wins over no_signal: elevated branch fires even when nobody has synced', () => {
    const r = summarizeTrustStrip([
      wf({
        state: 'needs_reconnect',
        reason: 'Reconnect required',
        lastSuccessfulSyncAt: null,
      }),
    ]);
    expect(r.kind).toBe('elevated');
  });
});
