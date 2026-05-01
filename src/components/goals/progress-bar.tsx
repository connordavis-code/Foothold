export type ProgressTone = 'positive' | 'negative' | 'warning' | 'neutral';

export function ProgressBar({
  fraction,
  tone,
}: {
  fraction: number;
  tone: ProgressTone;
}) {
  const fillClass = {
    positive: 'bg-positive',
    negative: 'bg-destructive',
    warning: 'bg-yellow-500',
    neutral: 'bg-foreground/70',
  }[tone];
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full ${fillClass} transition-all`}
        style={{
          width: `${Math.min(1, Math.max(0, fraction)) * 100}%`,
        }}
      />
    </div>
  );
}

/** Pick a tone for a spend-cap progress bar based on its fraction. */
export function spendCapTone(fraction: number): ProgressTone {
  if (fraction > 1) return 'negative';
  if (fraction > 0.8) return 'warning';
  return 'neutral';
}
