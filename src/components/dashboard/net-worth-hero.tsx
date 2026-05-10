import { FootholdMark } from '@/components/brand/foothold-mark';
import { CountUpNumber } from './count-up-number';
import { HeroTrajectory } from './hero-trajectory';

type Props = {
  netWorth: number;
  monthlyDelta: number;
  /** Empty array when <30d history — caller shows caveat instead. */
  historicalSeries: number[];
  forecastSeries: number[];
  band: { upper: number[]; lower: number[] } | null;
  /** Page-level freshness headline (T7's formatFreshness output). */
  freshnessHeadline: string;
  /** Optional caveat from formatFreshness. */
  freshnessCaveat?: string | null;
};

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function NetWorthHero({
  netWorth,
  monthlyDelta,
  historicalSeries,
  forecastSeries,
  band,
  freshnessHeadline,
  freshnessCaveat = null,
}: Props) {
  const deltaSign = monthlyDelta > 0 ? '+' : monthlyDelta < 0 ? '−' : '';

  return (
    <article
      className="relative overflow-hidden rounded-card bg-[--surface] p-6"
      style={{ minHeight: 280 }}
    >
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-end pr-4 opacity-[0.07]"
        aria-hidden
      >
        <FootholdMark size={320} withDot={false} />
      </div>

      <header className="relative flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.16em] text-[--text-3]">
          Net Worth
        </div>
        <div className="flex items-center gap-2 text-xs text-[--text-2]">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: 'var(--semantic-success)',
              boxShadow: '0 0 0 3px var(--dot-halo)',
            }}
          />
          You are here ·{' '}
          {new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </div>
      </header>

      <div className="relative mt-4 font-mono text-[clamp(2.5rem,5vw,3.75rem)] font-semibold tracking-tight tabular-nums text-[--text]">
        <CountUpNumber target={netWorth} />
      </div>

      {historicalSeries.length === 0 ? (
        <p className="relative mt-6 text-sm text-[--text-3]">
          Trend appears once your accounts have 30 days of history.
        </p>
      ) : (
        <div className="relative mt-4">
          <HeroTrajectory
            historicalSeries={historicalSeries}
            forecastSeries={forecastSeries}
            band={band}
          />
        </div>
      )}

      <footer className="relative mt-4 flex items-baseline justify-between gap-3 text-xs">
        <div
          style={{
            color:
              monthlyDelta < 0
                ? 'var(--semantic-caution)'
                : monthlyDelta > 0
                  ? 'var(--semantic-success)'
                  : 'var(--text-3)',
          }}
        >
          <span className="font-mono tabular-nums">
            {deltaSign}
            {fmtMoney(monthlyDelta)}
          </span>{' '}
          <span className="text-[--text-3]">this month</span>
        </div>
        <div className="text-right text-[--text-3]">
          <div>{freshnessHeadline}</div>
          {freshnessCaveat && <div className="mt-0.5">{freshnessCaveat}</div>}
        </div>
      </footer>
    </article>
  );
}
