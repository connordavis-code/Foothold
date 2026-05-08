import { describe, expect, it } from 'vitest';
import { summarizeSourceHealth } from './health-summary';

const NOW = new Date('2026-05-08T12:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('summarizeSourceHealth', () => {
  // Healthy sources get the briefer "Synced X ago" line because
  // the operator-tier intent is "silence reassures." When something
  // is elevated, we surface the classifier-authored reason instead.
  it('healthy + recent sync → "Synced 5m ago"', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'healthy',
          reason: 'All applicable capabilities fresh',
          lastSuccessfulSyncAt: new Date(NOW.getTime() - 5 * MINUTE),
        },
        NOW,
      ),
    ).toBe('Synced 5m ago');
  });

  it('healthy + hour-old sync → "Synced 2h ago"', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'healthy',
          reason: 'All applicable capabilities fresh',
          lastSuccessfulSyncAt: new Date(NOW.getTime() - 2 * HOUR),
        },
        NOW,
      ),
    ).toBe('Synced 2h ago');
  });

  it('healthy + no last sync → "Sync pending"', () => {
    // Defensive: classifier shouldn't return healthy without a success
    // timestamp, but if it does we render a benign string rather than
    // crashing on a null dereference.
    expect(
      summarizeSourceHealth(
        {
          state: 'healthy',
          reason: 'All applicable capabilities fresh',
          lastSuccessfulSyncAt: null,
        },
        NOW,
      ),
    ).toBe('Sync pending');
  });

  it('degraded → uses classifier reason verbatim', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'degraded',
          reason: '1 of 3 capabilities failing — transactions: rate_limit',
          lastSuccessfulSyncAt: new Date(NOW.getTime() - 5 * MINUTE),
        },
        NOW,
      ),
    ).toBe('1 of 3 capabilities failing — transactions: rate_limit');
  });

  it('failed → uses classifier reason verbatim', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'failed',
          reason: 'All 2 applicable capabilities failing',
          lastSuccessfulSyncAt: null,
        },
        NOW,
      ),
    ).toBe('All 2 applicable capabilities failing');
  });

  it('needs_reconnect → uses classifier reason verbatim', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'needs_reconnect',
          reason: 'Reconnect required (login)',
          lastSuccessfulSyncAt: new Date(NOW.getTime() - HOUR),
        },
        NOW,
      ),
    ).toBe('Reconnect required (login)');
  });

  it('stale → uses classifier reason verbatim', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'stale',
          reason: '1 of 2 capabilities not fresh',
          lastSuccessfulSyncAt: new Date(NOW.getTime() - 50 * HOUR),
        },
        NOW,
      ),
    ).toBe('1 of 2 capabilities not fresh');
  });

  it('unknown → uses classifier reason verbatim', () => {
    expect(
      summarizeSourceHealth(
        {
          state: 'unknown',
          reason: 'No sync data yet',
          lastSuccessfulSyncAt: null,
        },
        NOW,
      ),
    ).toBe('No sync data yet');
  });
});
