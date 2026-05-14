/**
 * Sync-time heuristic detectors for transfer-classification backfill.
 *
 * Each heuristic is a pure function — given the user's transactions (or
 * accounts), it returns the IDs to flip is_transfer_override to true.
 * The caller is responsible for writing only where the column is
 * currently NULL so a manual user override is never clobbered.
 *
 * Phase 1c of the simulator net-worth pivot. Trust model is separate
 * from Phase 1b (manual): heuristics make probabilistic suggestions;
 * users always win.
 */

export type CandidateTransaction = {
  id: string;
  accountId: string;
  /** ISO YYYY-MM-DD calendar date. */
  date: string;
  /** Plaid convention: positive = money OUT, negative = money IN. */
  amount: number;
  isTransferOverride: boolean | null;
};

export type MirrorImagePair = {
  outflowId: string;
  inflowId: string;
};

const AMOUNT_TOLERANCE = 0.01;
const DATE_WINDOW_DAYS = 1;

/**
 * Greedy pairing of mirror-image transfers. A pair is two transactions
 * that look like opposite legs of the same internal money move:
 *   - one outflow (amount > 0), one inflow (amount < 0)
 *   - same user, different accounts
 *   - dates within ±1 calendar day of each other
 *   - |outflow.amount + inflow.amount| ≤ $0.01 (rounding noise)
 *   - neither already has a user override
 *
 * Pairing is greedy in date-then-id order so the output is deterministic
 * across runs. Each transaction can appear in at most one pair — if 3
 * identical outflows face 1 inflow, only the earliest+lowest-id outflow
 * pairs; the stragglers wait for a future inflow or a manual override.
 *
 * Perf: O(n²) worst case. Benchmarked at 5000 candidates + 50 pairs
 * (forced worst-case shape — most candidates have no pair, forcing the
 * inner loop to scan the full list before giving up):
 *   median 303ms, max 343ms, ±2.56% RME over 20 samples (Vitest 4.1).
 * Sub-second under typical 90-day windows (1–3k unmarked txns:
 * ~12–110ms). Watch for heavy users with >10k unmarked txns in window
 * — at that point the curve clears 1s and warrants a smarter algo
 * (date-bucket pre-index, e.g.). See heuristics.bench.ts.
 */
export function findMirrorImageTransferPairs(
  transactions: readonly CandidateTransaction[],
): MirrorImagePair[] {
  const candidates = transactions
    .filter((t) => t.isTransferOverride === null && t.amount !== 0)
    .slice()
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id),
    );

  const pairs: MirrorImagePair[] = [];
  const claimed = new Set<string>();

  for (const out of candidates) {
    if (claimed.has(out.id)) continue;
    if (out.amount <= 0) continue;

    for (const inflow of candidates) {
      if (claimed.has(inflow.id)) continue;
      if (inflow.id === out.id) continue;
      if (inflow.amount >= 0) continue;
      if (inflow.accountId === out.accountId) continue;
      if (Math.abs(out.amount + inflow.amount) > AMOUNT_TOLERANCE) continue;
      if (daysBetween(out.date, inflow.date) > DATE_WINDOW_DAYS) continue;

      pairs.push({ outflowId: out.id, inflowId: inflow.id });
      claimed.add(out.id);
      claimed.add(inflow.id);
      break;
    }
  }

  return pairs;
}

function daysBetween(a: string, b: string): number {
  const ms =
    new Date(`${a}T00:00:00Z`).getTime() -
    new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(ms / (1000 * 60 * 60 * 24));
}

const MIN_INSTITUTION_NAME_LENGTH = 4;

/**
 * Detect which (if any) of the user's investment institutions a
 * transaction's merchant string matches — used by the heuristic
 * applier to track WHY a row was auto-marked in the per-match log.
 *
 * Returns the original (un-normalized) institution string that matched,
 * or null. First-match wins — iteration follows input order, so
 * callers wanting a particular precedence should sort upstream.
 *
 * Rule: normalize merchant and each institution to lowercase, strip
 * punctuation, collapse whitespace; match if a normalized institution
 * name of length ≥ 4 appears as a whole-phrase substring of the
 * normalized merchant. The 4-char floor blocks coincidental matches on
 * 2–3-letter codes ("TD", "AT", "PNC"); callers passing those should
 * disambiguate upstream.
 */
export function findMatchedInvestmentInstitution(
  merchantName: string | null,
  investmentInstitutions: readonly (string | null)[],
): string | null {
  if (!merchantName) return null;
  const merchant = normalize(merchantName);
  if (!merchant) return null;

  for (const institution of investmentInstitutions) {
    if (!institution) continue;
    const candidate = normalize(institution);
    if (candidate.length < MIN_INSTITUTION_NAME_LENGTH) continue;
    if (merchant.includes(candidate)) return institution;
  }
  return null;
}

/**
 * Boolean wrapper over findMatchedInvestmentInstitution for call sites
 * that only need the yes/no answer.
 */
export function merchantMatchesInvestmentInstitution(
  merchantName: string | null,
  investmentInstitutions: readonly (string | null)[],
): boolean {
  return (
    findMatchedInvestmentInstitution(merchantName, investmentInstitutions) !==
    null
  );
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
