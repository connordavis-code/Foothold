import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { SparklinePoint } from '@/lib/db/queries/dashboard';
import { formatCurrency } from '@/lib/utils';
import { Sparkline } from './sparkline';

type Props = {
  netWorth: number;
  monthlyDelta: number;
  sparkline: SparklinePoint[];
};

// Sub-dollar movement reads as noise — Plaid pending amounts and
// rounding can produce ±$0.01 deltas that shouldn't shout from the hero.
const FLAT_THRESHOLD = 1;

/**
 * Editorial hero — net worth as a confident display number over the
 * --gradient-hero deep-green canvas. The sparkline is decorative
 * context, not a precise chart. Monthly delta sits on a small pill so
 * gain/loss is unambiguous without a separate value+arrow tile.
 *
 * When the month is essentially flat, the delta pill is suppressed in
 * favor of a quieter "No change yet this month" label — printing
 * "↑ $0.00" misrepresents nothing-happened as something-happened.
 */
export function HeroCard({ netWorth, monthlyDelta, sparkline }: Props) {
  const isFlat = Math.abs(monthlyDelta) < FLAT_THRESHOLD;
  const isUp = monthlyDelta > 0;
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight;

  return (
    <section
      aria-labelledby="hero-net-worth"
      className="relative overflow-hidden rounded-card bg-gradient-hero p-6 text-white sm:p-8"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <p
            id="hero-net-worth"
            className="text-[10px] font-medium uppercase tracking-[0.08em] text-white/60"
          >
            Net worth
          </p>
          <p className="font-sans text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.02em] tabular-nums sm:text-5xl">
            {formatCurrency(netWorth)}
          </p>
          <div className="flex items-center gap-2">
            {isFlat ? (
              <span className="text-xs text-white/55">
                No change yet this month
              </span>
            ) : (
              <>
                <span
                  className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium tabular-nums ${
                    isUp
                      ? 'bg-emerald-400/15 text-emerald-200'
                      : 'bg-rose-400/15 text-rose-200'
                  }`}
                >
                  <Arrow className="h-3 w-3" />
                  {formatCurrency(Math.abs(monthlyDelta))}
                </span>
                <span className="text-xs text-white/55">this month</span>
              </>
            )}
          </div>
        </div>

        <div className="w-full text-emerald-200/80 md:w-72 md:max-w-xs">
          <Sparkline
            values={sparkline.map((p) => p.netWorth)}
            stroke="currentColor"
            height={56}
            fillOpacity={0.18}
          />
          <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-white/40">
            Last {sparkline.length} days
          </p>
        </div>
      </div>
    </section>
  );
}
