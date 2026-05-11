import type { AllocationSegment, AllocationClass } from '@/lib/investments/allocation';
import { formatCurrency } from '@/lib/utils';

// Restrained palette per DESIGN.md restraint floor. Single accent-green
// family graded by class importance; bond uses the only signal hue;
// cash + other slide into muted text/neutral. Avoids "Christmas tree".
//
// `--accent` is bare HSL (`99 21% 45%`) per globals.css, so we wrap it
// in `hsl(...)` here. Alpha grading uses modern CSS slash syntax —
// Tailwind's `/70` shorthand only works in className strings, not in
// inline `style` values.
const CLASS_PALETTE: Record<AllocationClass, string> = {
  Equity: 'var(--accent-strong)',
  ETF: 'hsl(var(--accent))',
  'Mutual fund': 'hsl(var(--accent) / 0.7)',
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
            className="flex items-center gap-3"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CLASS_PALETTE[seg.name] }}
            />
            <span className="flex-1 text-[--text-2]">{seg.name}</span>
            <span className="font-mono tabular-nums text-[--text-3]">
              {seg.pct.toFixed(1)}%
            </span>
            <span className="w-24 text-right font-mono tabular-nums text-[--text]">
              {formatCurrency(seg.value)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
