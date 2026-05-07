import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  financialAccounts,
  externalItems,
  transactions,
} from '@/lib/db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Drift thresholds — same as the pt1 prompt. A category is "elevated"
 * for week W only if ALL three hold:
 *   - baseline (median of weeks W-1..W-4) >= MIN_BASELINE
 *   - current week total >= MIN_CURRENT
 *   - current / baseline >= MIN_RATIO
 *
 * Smaller categories are noise; underspend is never flagged.
 */
export const MIN_BASELINE = 25;
export const MIN_CURRENT = 50;
export const MIN_RATIO = 1.5;

/** How many weeks of trailing history are visible in the trend chart. */
export const DEFAULT_HISTORY_WEEKS = 8;

/** Soft cap on the bar leaderboard. Beyond this and the surface
 * starts to read as a forensic dump rather than a scan; the flag
 * history table covers depth. */
export const MAX_LEADERBOARD_ROWS = 8;

/** How many additional weeks we pull to seed the baseline of the
 * oldest visible week. Median of 4 prior weeks → +4. */
const BASELINE_LOOKBACK_WEEKS = 4;

export type WeeklyCategoryPoint = {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  total: number;
};

export type CategoryHistory = {
  category: string;
  /** Chronological, oldest first. Length === DEFAULT_HISTORY_WEEKS. */
  weeks: WeeklyCategoryPoint[];
  /** Total spend across the visible window (used to pick top categories). */
  totalSpend: number;
};

export type DriftFlag = {
  category: string;
  weekStart: string;
  weekEnd: string;
  currentTotal: number;
  baselineWeekly: number;
  /** currentTotal / baselineWeekly. */
  ratio: number;
};

export type LeaderboardRow = {
  category: string;
  /** This week's spend in this category. */
  currentTotal: number;
  /** Median of the prior 4 weeks. */
  baselineWeekly: number;
  /** currentTotal / baselineWeekly. ≥1 = above typical, <1 = below. */
  ratio: number;
  /** True if this row also passes the flagging thresholds (ratio
   * ≥ MIN_RATIO and current ≥ MIN_CURRENT). The leaderboard's floor
   * is more inclusive than flagging — this flag lets the UI tint
   * elevated rows with the amber accent established elsewhere. */
  isElevated: boolean;
};

export type DriftAnalysis = {
  /** Anchor — the most recent visible week's end date. Yesterday in UTC. */
  weekEnd: string;
  /** Top categories by total spend across the visible window. */
  topCategories: CategoryHistory[];
  /** Categories elevated in the most recent week. */
  currentlyElevated: DriftFlag[];
  /** Flags from any of the visible weeks (newest first). */
  flagHistory: DriftFlag[];
  /** Bar-leaderboard rows: cats with both current AND baseline ≥
   * MIN_BASELINE, sorted by ratio desc, capped at MAX_LEADERBOARD_ROWS. */
  leaderboard: LeaderboardRow[];
  /** Total visible weeks (8). */
  weeks: number;
  /** True if the user has fewer than 4 weeks of any spend → flagging meaningless. */
  baselineSparse: boolean;
};

const NON_SPEND_FILTER = sql`COALESCE(${transactions.primaryCategory}, '') NOT IN ('TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS')`;

function shiftDate(yyyymmdd: string, deltaDays: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function yesterday(): string {
  return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build the weekly windows we'll bucket transactions into. Returns
 * entries in chronological order (oldest first) covering
 * `visibleWeeks + BASELINE_LOOKBACK_WEEKS` total weeks anchored on
 * `endAnchor`.
 *
 * Each week is [end-6, end] inclusive.
 */
function buildWeekWindows(
  endAnchor: string,
  visibleWeeks: number,
): Array<{ weekStart: string; weekEnd: string; isVisible: boolean }> {
  const totalWeeks = visibleWeeks + BASELINE_LOOKBACK_WEEKS;
  const windows: Array<{
    weekStart: string;
    weekEnd: string;
    isVisible: boolean;
  }> = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekEnd = shiftDate(endAnchor, -7 * i);
    const weekStart = shiftDate(weekEnd, -6);
    windows.unshift({
      weekStart,
      weekEnd,
      // i=0..visibleWeeks-1 are visible; older are baseline-only.
      isVisible: i < visibleWeeks,
    });
  }
  return windows;
}

/**
 * Median of up to 4 numbers. Behavior matches pt1's snapshot:
 * for fewer than 4 weeks of data, missing weeks count as 0, so the
 * median pulls down. A category that spiked once won't establish a
 * baseline (median of [0,0,0,X] = 0).
 */
function median4(values: number[]): number {
  const padded = [0, 0, 0, 0];
  for (let i = 0; i < Math.min(4, values.length); i++) padded[i] = values[i];
  const sorted = [...padded].sort((a, b) => a - b);
  return (sorted[1] + sorted[2]) / 2;
}

/**
 * Pure builder for the bar-leaderboard rows. Extracted so it's
 * testable without a database — same pattern as Phase 6.6's pure-
 * predicate extraction (buildDigestSubject, isPublicApiPath, etc.).
 *
 * Inclusion rule: cat shows up if BOTH current-week total AND prior-
 * 4-week median are ≥ MIN_BASELINE. The "AND" rejects two noise
 * shapes: cats that stopped (real baseline, no current) and cats
 * that just started (current spend, no baseline → divide-by-zero
 * fallback would be misleading).
 *
 * Sort: ratio desc — hottest at top. Cats that are flat (ratio ≈ 1)
 * sort below hot; cats running cool (ratio < 1) sort to the bottom.
 *
 * Cap: top MAX_LEADERBOARD_ROWS by ratio. The flag history table
 * covers depth; this surface is for scan, not forensics.
 */
export function buildLeaderboard(
  perCategory: Map<string, number[]>,
  currentWeekIdx: number,
): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const [category, weekly] of perCategory.entries()) {
    const currentTotal = weekly[currentWeekIdx] ?? 0;
    const priorFour = [
      weekly[currentWeekIdx - 1] ?? 0,
      weekly[currentWeekIdx - 2] ?? 0,
      weekly[currentWeekIdx - 3] ?? 0,
      weekly[currentWeekIdx - 4] ?? 0,
    ];
    const baselineWeekly = median4(priorFour);
    if (currentTotal < MIN_BASELINE) continue;
    if (baselineWeekly < MIN_BASELINE) continue;
    const ratio = currentTotal / baselineWeekly;
    rows.push({
      category,
      currentTotal,
      baselineWeekly,
      ratio,
      isElevated:
        currentTotal >= MIN_CURRENT && ratio >= MIN_RATIO,
    });
  }
  rows.sort((a, b) => b.ratio - a.ratio);
  return rows.slice(0, MAX_LEADERBOARD_ROWS);
}

/**
 * Pull all transactions in the lookback window, bucket by
 * (weekIndex, primary_category), then derive trend history + drift
 * flags for every visible week.
 */
export async function getDriftAnalysis(
  userId: string,
  visibleWeeks: number = DEFAULT_HISTORY_WEEKS,
  endAnchor?: string,
): Promise<DriftAnalysis> {
  const anchor = endAnchor ?? yesterday();
  const windows = buildWeekWindows(anchor, visibleWeeks);
  const earliest = windows[0].weekStart;
  const latest = windows[windows.length - 1].weekEnd;

  const rows = await db
    .select({
      date: transactions.date,
      category: sql<string>`COALESCE(${transactions.primaryCategory}, 'UNCATEGORIZED')`,
      amount: transactions.amount,
    })
    .from(transactions)
    .innerJoin(
      financialAccounts,
      eq(financialAccounts.id, transactions.accountId),
    )
    .innerJoin(externalItems, eq(externalItems.id, financialAccounts.itemId))
    .where(
      and(
        eq(externalItems.userId, userId),
        gte(transactions.date, earliest),
        lte(transactions.date, latest),
        sql`${transactions.amount}::numeric > 0`,
        sql`${financialAccounts.type} != 'investment'`,
        NON_SPEND_FILTER,
      ),
    );

  // Index window by date for O(1) bucket lookup.
  const windowByDate = new Map<string, number>();
  for (let i = 0; i < windows.length; i++) {
    let cursor = windows[i].weekStart;
    while (cursor <= windows[i].weekEnd) {
      windowByDate.set(cursor, i);
      cursor = shiftDate(cursor, 1);
    }
  }

  // perCategory[category] = number[totalWeeks] of weekly totals.
  const perCategory = new Map<string, number[]>();
  for (const r of rows) {
    const idx = windowByDate.get(r.date);
    if (idx == null) continue;
    const arr = perCategory.get(r.category) ?? new Array(windows.length).fill(0);
    arr[idx] += Number(r.amount);
    perCategory.set(r.category, arr);
  }

  // Compute flags for each visible week of each category.
  const allFlags: DriftFlag[] = [];
  const visibleStartIdx = BASELINE_LOOKBACK_WEEKS; // first visible week's index
  const lastIdx = windows.length - 1;

  for (const [category, weekly] of perCategory.entries()) {
    for (let i = visibleStartIdx; i < windows.length; i++) {
      const current = weekly[i];
      if (current < MIN_CURRENT) continue;
      // Baseline = median of the 4 immediately preceding weeks.
      const priorFour = [
        weekly[i - 1],
        weekly[i - 2],
        weekly[i - 3],
        weekly[i - 4],
      ];
      const baselineWeekly = median4(priorFour);
      if (baselineWeekly < MIN_BASELINE) continue;
      const ratio = current / baselineWeekly;
      if (ratio < MIN_RATIO) continue;
      allFlags.push({
        category,
        weekStart: windows[i].weekStart,
        weekEnd: windows[i].weekEnd,
        currentTotal: current,
        baselineWeekly,
        ratio,
      });
    }
  }

  // Build trend history: only the visible window, top categories first.
  const histories: CategoryHistory[] = [];
  for (const [category, weekly] of perCategory.entries()) {
    const visible = weekly.slice(visibleStartIdx);
    const totalSpend = visible.reduce((s, n) => s + n, 0);
    if (totalSpend === 0) continue;
    histories.push({
      category,
      totalSpend,
      weeks: visible.map((total, i) => ({
        weekStart: windows[visibleStartIdx + i].weekStart,
        weekEnd: windows[visibleStartIdx + i].weekEnd,
        total,
      })),
    });
  }
  histories.sort((a, b) => b.totalSpend - a.totalSpend);

  const currentlyElevated = allFlags
    .filter((f) => f.weekEnd === windows[lastIdx].weekEnd)
    .sort((a, b) => b.ratio - a.ratio);

  const flagHistory = [...allFlags].sort((a, b) => {
    if (a.weekEnd !== b.weekEnd) return a.weekEnd > b.weekEnd ? -1 : 1;
    return b.ratio - a.ratio;
  });

  const baselineSparse = histories.every(
    (h) => h.weeks.every((w) => w.total === 0),
  );

  const leaderboard = buildLeaderboard(perCategory, lastIdx);

  return {
    weekEnd: anchor,
    topCategories: histories,
    currentlyElevated,
    flagHistory,
    leaderboard,
    weeks: visibleWeeks,
    baselineSparse,
  };
}
