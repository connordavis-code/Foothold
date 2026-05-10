// src/lib/goals/coaching.ts
import { formatCurrencyCompact } from '@/lib/utils';
import { humanizeDate } from '@/lib/format/date';

export type CoachingInput =
  | {
      kind: 'savings';
      verdict: 'on-pace';
      monthlyVelocity: number;
      requiredMonthlyVelocity: number;
      topDiscretionaryCategory: null;
    }
  | {
      kind: 'savings';
      verdict: 'behind';
      monthlyVelocity: number;
      requiredMonthlyVelocity: number;
      topDiscretionaryCategory: { name: string; monthlyAmount: number } | null;
    }
  | {
      kind: 'savings';
      verdict: 'hit';
      hitDate: string;
      overshoot: number;
    }
  | {
      kind: 'spend_cap';
      verdict: 'on-pace';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    }
  | {
      kind: 'spend_cap';
      verdict: 'behind';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    }
  | {
      kind: 'spend_cap';
      verdict: 'over';
      cap: number;
      spent: number;
      projectedMonthly: number;
      topMerchants: ReadonlyArray<{ name: string; amount: number }>;
    };

export type CoachingOutput = {
  status: string;
  action: string | null;
};

/**
 * Pure two-sentence coaching producer. Status sentence is mandatory; action
 * sentence is null on hit/on-pace paths and on behind paths that lack the
 * data needed to suggest a concrete cut. No LLM — every output is a
 * deterministic function of numerical inputs (LLM upgrade is its own phase).
 *
 * Uses `formatCurrencyCompact` (drops trailing zeros for whole-dollar
 * amounts) because output is narrative prose, not a numeric column.
 */
export function composeCoaching(input: CoachingInput): CoachingOutput {
  if (input.kind === 'savings') {
    if (input.verdict === 'hit') {
      return {
        status: `You hit this goal ${humanizeDate(input.hitDate)} — ${formatCurrencyCompact(input.overshoot)} ahead of target.`,
        action: null,
      };
    }
    const deficit = input.requiredMonthlyVelocity - input.monthlyVelocity;
    if (input.verdict === 'on-pace') {
      const surplus = -deficit;
      return {
        status: `You're ${formatCurrencyCompact(surplus)}/mo ahead of pace.`,
        action: null,
      };
    }
    // behind
    const status = `You're ${formatCurrencyCompact(deficit)}/mo behind pace.`;
    if (!input.topDiscretionaryCategory) {
      return { status, action: null };
    }
    const cat = input.topDiscretionaryCategory;
    return {
      status,
      action: `Trim ${cat.name} (your largest discretionary at ${formatCurrencyCompact(cat.monthlyAmount)}/mo) by ${formatCurrencyCompact(deficit)} to recover.`,
    };
  }

  // spend_cap
  if (input.verdict === 'on-pace') {
    const margin = input.cap - input.projectedMonthly;
    return {
      status: `Tracking ${formatCurrencyCompact(margin)} under the cap.`,
      action: null,
    };
  }

  const overage =
    input.verdict === 'over'
      ? input.spent - input.cap
      : input.projectedMonthly - input.cap;
  const status =
    input.verdict === 'over'
      ? `Already ${formatCurrencyCompact(overage)} over the cap.`
      : `Projected to overspend by ${formatCurrencyCompact(overage)} at this pace.`;

  if (input.topMerchants.length === 0) {
    return { status, action: null };
  }
  const merchantList = input.topMerchants
    .slice(0, 3)
    .map((m) => `${m.name} (${formatCurrencyCompact(m.amount)})`)
    .join(', ');
  return {
    status,
    action: `Skipping any one of ${merchantList} resets your pace.`,
  };
}
