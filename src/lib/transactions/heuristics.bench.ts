import { bench, describe } from 'vitest';
import {
  findMirrorImageTransferPairs,
  type CandidateTransaction,
} from './heuristics';

/**
 * Worst-case shape: many candidates, few mirror pairs to claim early.
 * The greedy outer×inner loops can't short-circuit until the entire
 * candidate list is scanned for each unmatched outflow — so a 5000-txn
 * input with only 50 injected pairs forces the algorithm through its
 * deepest inner-scan path.
 *
 * Run with: npx vitest bench heuristics.bench.ts
 */

// Linear congruential RNG — seeded so runs are reproducible.
function* lcg(seed: number) {
  let s = seed >>> 0;
  while (true) {
    s = (s * 1664525 + 1013904223) >>> 0;
    yield s / 4294967296;
  }
}

function generateCandidates(n: number): CandidateTransaction[] {
  const rng = lcg(42);
  const next = () => rng.next().value as number;
  const accounts = ['checking', 'savings', 'credit', 'brokerage', 'ira'];
  const result: CandidateTransaction[] = [];

  // Random noise — most won't pair with anything.
  for (let i = 0; i < n; i++) {
    const dayOffset = Math.floor(next() * 90);
    const date = new Date('2026-05-13T00:00:00Z');
    date.setUTCDate(date.getUTCDate() - dayOffset);
    const amount = Math.round((next() - 0.5) * 100000) / 100; // -$500..+$500
    const accountId = accounts[Math.floor(next() * accounts.length)]!;
    result.push({
      id: `noise-${i}`,
      accountId,
      date: date.toISOString().slice(0, 10),
      amount,
      isTransferOverride: null,
    });
  }

  // 50 deliberate mirror pairs — gives the algorithm real work to claim.
  for (let i = 0; i < 50; i++) {
    const amt = 200 + i;
    result.push({
      id: `pair-out-${i}`,
      accountId: 'checking',
      date: '2026-05-10',
      amount: amt,
      isTransferOverride: null,
    });
    result.push({
      id: `pair-in-${i}`,
      accountId: 'brokerage',
      date: '2026-05-10',
      amount: -amt,
      isTransferOverride: null,
    });
  }

  return result;
}

describe('findMirrorImageTransferPairs perf', () => {
  const txns5k = generateCandidates(5000);

  bench(
    '5000 candidates + 50 injected pairs (realistic 90-day window worst case)',
    () => {
      findMirrorImageTransferPairs(txns5k);
    },
    { iterations: 20 },
  );
});
