export type ProgressTone = 'positive' | 'negative' | 'warning' | 'neutral';

export function ProgressBar({
  fraction,
  tone,
  tickFraction,
}: {
  fraction: number;
  tone: ProgressTone;
  /**
   * Optional baseline mark rendered as a 2px tick above the bar.
   * Used by the /goals leaderboard to show "ideal pace" (savings) or
   * "projected month-end" (caps) against the actual fill. Same visual
   * vocabulary as /drift's baseline tick.
   */
  tickFraction?: number;
}) {
  const fillClass = {
    positive: 'bg-positive',
    negative: 'bg-destructive',
    warning: 'bg-amber-500',
    neutral: 'bg-foreground/70',
  }[tone];
  const fillPct = Math.min(1, Math.max(0, fraction)) * 100;
  const tickPct =
    tickFraction == null ? null : Math.min(1, Math.max(0, tickFraction)) * 100;
  return (
    <div className="relative h-2">
      <div className="h-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${fillClass} transition-all`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      {tickPct != null && (
        <div
          className="absolute inset-y-0 w-0.5 rounded-full bg-muted-foreground/70"
          style={{ left: `calc(${tickPct}% - 1px)` }}
          aria-hidden
        />
      )}
    </div>
  );
}

/** Pick a tone for a spend-cap progress bar based on its fraction. */
export function spendCapTone(fraction: number): ProgressTone {
  if (fraction > 1) return 'negative';
  if (fraction > 0.8) return 'warning';
  return 'neutral';
}
