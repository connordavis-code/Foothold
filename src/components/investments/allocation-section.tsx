import type { AllocationSegment, AllocationClass } from '@/lib/investments/allocation';
import { formatCurrency } from '@/lib/utils';

// Allocation palette. Original attempt used a single accent-green
// family graded by lightness/alpha — UAT in dark mode showed the steps
// were too narrow; ETF, Equity, Mutual fund all read as identical
// greens. Swapped to the editorial chart palette (`--chart-1..6`,
// three hue families × two lightness levels — see globals.css).
//
// Hue assignments are SEMANTIC, not by-segment-size:
//   Equity     → chart-1 (foothold-green) — primary asset class, gets
//                the brand hue.
//   ETF        → chart-3 (warm copper) — wraps equities but reads as a
//                distinct vehicle; copper differentiates without
//                pulling away from the green family entirely.
//   Mutual fund → chart-2 (cool slate) — third hue family for clean
//                three-way differentiation.
//   Bond       → semantic-caution (amber). Bonds aren't a chart-hue
//                position; they're a signal-hue asset class
//                (income-yielding, risk-averse — caution reads right).
//   Cash / Other → muted neutrals. These are residual buckets, not
//                  asset class positions; low saturation reinforces
//                  the semantic difference.
//
// All HSL refs use `hsl(var(--x))` because the chart tokens are bare
// HSL per globals.css convention.
const CLASS_PALETTE: Record<AllocationClass, string> = {
  Equity: 'hsl(var(--chart-1))',
  ETF: 'hsl(var(--chart-3))',
  'Mutual fund': 'hsl(var(--chart-2))',
  'Bond / fixed income': 'var(--semantic-caution)',
  Cash: 'var(--text-3)',
  Other: 'color-mix(in srgb, var(--text-3) 60%, transparent)',
};

export function AllocationSection({
  allocation,
}: {
  allocation: AllocationSegment[];
}) {
  if (allocation.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-[--hairline] bg-[--surface] p-6 md:p-8">
      <header>
        <p className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Allocation
        </p>
        <h2 className="mt-1 text-lg font-semibold text-[--text]">
          How it&apos;s distributed
        </h2>
      </header>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[--hairline]">
        {allocation.map((seg) => (
          <div
            key={seg.name}
            style={{
              width: `${seg.pct}%`,
              background: CLASS_PALETTE[seg.name],
            }}
            title={`${seg.name} · ${seg.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {allocation.map((seg) => (
          <li
            key={seg.name}
            className="flex items-baseline gap-1.5"
          >
            <span
              className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
              style={{ background: CLASS_PALETTE[seg.name] }}
            />
            <span className="text-[--text-2]">{seg.name}</span>
            <span className="font-mono tabular-nums text-[--text-3]">
              ({seg.pct.toFixed(1)}%)
            </span>
            <span className="text-[--text-3]" aria-hidden>
              ·
            </span>
            <span className="font-mono tabular-nums text-[--text]">
              {formatCurrency(seg.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
