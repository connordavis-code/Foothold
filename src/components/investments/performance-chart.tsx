'use client';

import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  PortfolioHistory,
  RangeKey,
} from '@/lib/db/queries/portfolio-history';
import { cn, formatCurrency } from '@/lib/utils';

const RANGES: RangeKey[] = ['1D', '1M', '3M', '6M', '1Y', '5Y'];

/**
 * Range-tabbed performance chart. Two Recharts <Line> series share an
 * X axis: one solid line for snapshot data (real), one dashed line
 * for walkback data (estimated). Recharts skips null values so each
 * line renders only where its data is non-null. The seam date appears
 * in both arrays so the two lines visually connect.
 *
 * 1D tab is special-cased — when fewer than 2 points exist, the tab
 * is rendered but disabled (no closePrice data yet from sync).
 *
 * Strike-3 RSC boundary guard: props are plain-data only. The
 * `history` value is a plain object with arrays of plain objects;
 * no function props cross the server→client boundary.
 */
export function PerformanceChart({ history }: { history: PortfolioHistory }) {
  const [range, setRange] = useState<RangeKey>('1M');
  const data = history.byRange[range];
  const oneDayDisabled = history.byRange['1D'].points.length < 2;

  // Build paired data for Recharts: { date, valueReal, valueEstimated }.
  // Each point sets EITHER valueReal or valueEstimated (never both),
  // EXCEPT the seam date — that one sets BOTH so the dashed line ends
  // exactly where the solid line begins (visual continuity).
  const seriesData = useMemo(() => {
    return data.points.map((p) => {
      const isSeam = data.seamDate != null && p.date === data.seamDate;
      const isEstimated = p.estimated;
      return {
        date: p.date,
        valueReal: !isEstimated ? p.value : isSeam ? p.value : null,
        valueEstimated: isEstimated || isSeam ? p.value : null,
      };
    });
  }, [data]);

  const isUp = data.delta != null && data.delta >= 0;

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Performance
          </p>
          <p className="mt-1 text-sm text-[--text-2]">
            {range} change ·{' '}
            {data.delta != null ? (
              <span
                className={cn(
                  'font-mono tabular-nums',
                  isUp ? 'text-positive' : 'text-destructive',
                )}
              >
                {formatCurrency(data.delta, { signed: true })}
              </span>
            ) : (
              <span className="text-[--text-3]">—</span>
            )}
          </p>
        </div>
        <RangeTabs
          range={range}
          onChange={setRange}
          oneDayDisabled={oneDayDisabled}
        />
      </header>

      {data.points.length === 0 ? (
        <EmptyState range={range} />
      ) : (
        <>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesData}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin - 50', 'dataMax + 50']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--hairline)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'var(--text-2)' }}
                  formatter={(value) =>
                    typeof value === 'number' ? formatCurrency(value) : '—'
                  }
                />
                <Line
                  type="monotone"
                  dataKey="valueEstimated"
                  stroke="hsl(var(--accent))"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="valueReal"
                  stroke="hsl(var(--accent))"
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-baseline justify-between font-mono text-xs tabular-nums text-[--text-3]">
            <span>
              {data.startValue != null ? formatCurrency(data.startValue) : '—'}
            </span>
            {data.seamDate && (
              <span className="text-[--text-2]">
                Earlier values estimated from recorded transactions
              </span>
            )}
            <span>
              {data.endValue != null ? formatCurrency(data.endValue) : '—'}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function RangeTabs({
  range,
  onChange,
  oneDayDisabled,
}: {
  range: RangeKey;
  onChange: (next: RangeKey) => void;
  oneDayDisabled: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-[--hairline] p-1">
      {RANGES.map((r) => {
        const disabled = r === '1D' && oneDayDisabled;
        const active = range === r;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => onChange(r)}
            className={cn(
              'rounded-full px-3 py-1 font-mono text-xs tabular-nums transition-colors',
              active && 'bg-accent/12 text-accent',
              !active && !disabled && 'text-[--text-2] hover:text-[--text]',
              disabled && 'cursor-not-allowed text-[--text-3] opacity-50',
            )}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ range }: { range: RangeKey }) {
  return (
    <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-[--hairline] text-center text-sm text-[--text-3]">
      <div>
        <p>Trajectory builds with daily snapshots</p>
        <p className="mt-1 text-xs">
          {range === '1D'
            ? 'Day delta will appear once price data lands'
            : 'Run a sync to capture today, then check back tomorrow.'}
        </p>
      </div>
    </div>
  );
}
