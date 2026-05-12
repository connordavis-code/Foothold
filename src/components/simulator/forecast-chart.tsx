'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MonthlyProjection } from '@/lib/forecast/types';
import type { ChartMarker } from '@/lib/simulator/markers';
import type { RangeParam } from '@/lib/simulator/url-state';
import { formatCurrency } from '@/lib/utils';

type Props = {
  baseline: MonthlyProjection[];
  scenario: MonthlyProjection[];
  markers: ChartMarker[];
  range: RangeParam;
  showScenario?: boolean;
  /** "12 months · 2027-05 projected" headline above the chart. Derived by parent. */
  subtitle?: string;
  /** Freshness annotation rendered below the title. */
  freshnessHeadline?: string;
  freshnessCaveat?: string | null;
};

const RANGE_TO_MONTHS: Record<RangeParam, number> = { '1Y': 12, '2Y': 24 };

export function ForecastChart({
  baseline,
  scenario,
  markers,
  range,
  showScenario = true,
  subtitle,
  freshnessHeadline,
  freshnessCaveat,
}: Props) {
  const horizonMonths = RANGE_TO_MONTHS[range];
  const visibleBaseline = baseline.slice(0, horizonMonths);
  const visibleScenario = scenario.slice(0, horizonMonths);

  const W = 1000;
  const H = 320;
  const padL = 56;
  const padR = 24;
  const padT = 20;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = useMemo(() => {
    const vs: number[] = [];
    for (const m of visibleBaseline) vs.push(m.endCash);
    if (showScenario) for (const m of visibleScenario) vs.push(m.endCash);
    return vs;
  }, [visibleBaseline, visibleScenario, showScenario]);

  const { lo, hi } = useMemo(() => {
    if (allVals.length === 0) return { lo: -1000, hi: 1000 };
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = Math.max(100, (max - min) * 0.15);
    return { lo: min - pad, hi: max + pad };
  }, [allVals]);

  const months = visibleBaseline.map((m) => m.month);

  const x = useCallback(
    (i: number) =>
      months.length > 1
        ? padL + (i / (months.length - 1)) * innerW
        : padL + innerW / 2,
    [months.length, innerW],
  );
  const y = useCallback(
    (v: number) => (hi === lo ? padT + innerH / 2 : padT + innerH - ((v - lo) / (hi - lo)) * innerH),
    [hi, lo, innerH],
  );

  const baselinePath = useMemo(() => {
    if (visibleBaseline.length === 0) return '';
    return visibleBaseline
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m.endCash).toFixed(1)}`)
      .join(' ');
  }, [visibleBaseline, x, y]);

  const scenarioPath = useMemo(() => {
    if (!showScenario || visibleScenario.length === 0) return '';
    return visibleScenario
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(m.endCash).toFixed(1)}`)
      .join(' ');
  }, [visibleScenario, showScenario, x, y]);

  // Y-axis ticks — pick 5 evenly spaced rounded values
  const ticks = useMemo(() => buildTicks(lo, hi, 5), [lo, hi]);

  // Hover state
  const [hover, setHover] = useState<number | null>(null);
  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = ((e.clientX - rect.left) / rect.width) * W;
      const ratio = (localX - padL) / innerW;
      const idx = Math.round(ratio * (months.length - 1));
      setHover(Math.max(0, Math.min(months.length - 1, idx)));
    },
    [months.length, innerW],
  );

  const tipBaseline = hover !== null ? visibleBaseline[hover]?.endCash ?? null : null;
  const tipScenario =
    hover !== null && showScenario ? visibleScenario[hover]?.endCash ?? null : null;
  const tipDelta =
    tipBaseline !== null && tipScenario !== null ? tipScenario - tipBaseline : null;

  return (
    <div className="rounded-card border border-hairline bg-surface p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-foreground">Cash forecast</h3>
          {subtitle && (
            <p className="font-mono text-xs text-text-3 tabular-nums" style={{ marginTop: 4 }}>
              {subtitle}
            </p>
          )}
          {freshnessHeadline && (
            <p className="text-eyebrow" style={{ marginTop: 6 }}>
              {freshnessHeadline}
            </p>
          )}
          {freshnessCaveat && (
            <p className="text-xs text-text-3" style={{ marginTop: 2 }}>
              {freshnessCaveat}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-text-2">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-px w-4"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 6px)',
                color: 'var(--text-2)',
              }}
            />
            baseline
          </span>
          {showScenario && (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-[2px] w-4 rounded-full"
                style={{ background: 'hsl(var(--accent))' }}
              />
              scenario
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-[280px] cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Gridlines */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--hairline)"
                strokeDasharray={t === 0 ? '0' : '2 4'}
                strokeWidth={t === 0 ? 1 : 0.8}
                opacity={t === 0 ? 1 : 0.7}
              />
              <text
                x={padL - 8}
                y={y(t) + 4}
                textAnchor="end"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--text-3)' }}
              >
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {months.map((m, i) =>
            i % Math.max(1, Math.floor(months.length / 6)) === 0 || i === months.length - 1 ? (
              <text
                key={`xl-${i}`}
                x={x(i)}
                y={H - 12}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fill: 'var(--text-3)',
                  letterSpacing: '0.05em',
                }}
              >
                {m}
              </text>
            ) : null,
          )}

          {/* Goal / runway markers */}
          {markers.map((mk, mi) => {
            if (mk.monthIndex < 0 || mk.monthIndex >= months.length) return null;
            const mx = x(mk.monthIndex);
            const isWarn = mk.kind === 'runwayDepleted';
            const stroke = isWarn ? 'var(--semantic-caution)' : 'hsl(var(--accent))';
            const label = isWarn ? 'RUNWAY DEPLETED' : (mk.kind === 'goalArrival' ? mk.goalName.toUpperCase() : '');
            const sub = isWarn ? 'baseline only' : (mk.kind === 'goalArrival' ? months[mk.monthIndex] : '');
            return (
              <g key={`marker-${mi}`} opacity={isWarn ? 0.55 : 0.9}>
                <line
                  x1={mx}
                  x2={mx}
                  y1={padT + 30}
                  y2={H - padB}
                  stroke={stroke}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <circle cx={mx} cy={padT + 30} r={2.5} fill={stroke} />
                <text
                  x={mx}
                  y={padT + 14}
                  textAnchor={mk.monthIndex > months.length - 3 ? 'end' : 'middle'}
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fill: stroke,
                    fontWeight: 500,
                  }}
                >
                  {label}
                </text>
                <text
                  x={mx}
                  y={padT + 26}
                  textAnchor={mk.monthIndex > months.length - 3 ? 'end' : 'middle'}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    fill: 'var(--text-3)',
                  }}
                >
                  {sub}
                </text>
              </g>
            );
          })}

          {/* Baseline line — dashed */}
          {baselinePath && (
            <path
              d={baselinePath}
              fill="none"
              stroke="var(--text-2)"
              strokeWidth={1.4}
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity={0.65}
            />
          )}

          {/* Scenario line — solid */}
          {showScenario && scenarioPath && (
            <path
              d={scenarioPath}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* "You are here" position dot at today */}
          {months.length > 0 && (() => {
            const tx0 = x(0);
            const ty0 = y(
              (showScenario ? visibleScenario[0]?.endCash : visibleBaseline[0]?.endCash) ?? 0,
            );
            return (
              <g pointerEvents="none">
                <circle cx={tx0} cy={ty0} r={7} fill="hsl(var(--accent))" opacity={0.18}>
                  <animate attributeName="r" values="5;10;5" dur="2.6s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.28;0.05;0.28" dur="2.6s" repeatCount="indefinite" />
                </circle>
                <circle cx={tx0} cy={ty0} r={3.5} fill="hsl(var(--accent))" />
                <circle cx={tx0} cy={ty0} r={1.5} fill="var(--bg)" />
              </g>
            );
          })()}

          {/* Hover crosshair + dots */}
          {hover !== null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={H - padB}
                stroke="var(--hairline-strong)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              {tipBaseline !== null && (
                <circle cx={x(hover)} cy={y(tipBaseline)} r={3} fill="var(--text-2)" />
              )}
              {tipScenario !== null && (
                <circle cx={x(hover)} cy={y(tipScenario)} r={3.5} fill="hsl(var(--accent))" />
              )}
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover !== null && (
          <div
            className="absolute top-2 rounded-md border border-hairline bg-surface-elevated p-3 text-xs shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform:
                x(hover) > W * 0.7 ? 'translateX(-110%)' : 'translateX(10%)',
              pointerEvents: 'none',
            }}
          >
            <div className="text-eyebrow mb-1">{months[hover]}</div>
            {tipBaseline !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-3">baseline</span>
                <span className="font-mono tabular-nums text-text-2">
                  {formatCurrency(tipBaseline)}
                </span>
              </div>
            )}
            {tipScenario !== null && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-3">scenario</span>
                <span className="font-mono tabular-nums" style={{ color: 'hsl(var(--accent))' }}>
                  {formatCurrency(tipScenario)}
                </span>
              </div>
            )}
            {tipDelta !== null && (
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-hairline pt-1">
                <span className="text-text-3">delta</span>
                <span className="font-mono tabular-nums" style={{ color: 'hsl(var(--accent))' }}>
                  {tipDelta >= 0 ? '+' : ''}
                  {formatCurrency(tipDelta)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildTicks(lo: number, hi: number, count: number): number[] {
  if (hi === lo) return [lo];
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => roundNice(lo + i * step));
}

function roundNice(n: number): number {
  const abs = Math.abs(n);
  if (abs < 100) return Math.round(n / 10) * 10;
  if (abs < 1000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
}

function formatTick(t: number): string {
  if (t === 0) return '$0';
  const abs = Math.abs(t);
  if (abs >= 1000) return `${t < 0 ? '-' : ''}$${(abs / 1000).toFixed(0)}K`;
  return `${t < 0 ? '-' : ''}$${abs.toFixed(0)}`;
}
