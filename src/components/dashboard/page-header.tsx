/**
 * Top-of-dashboard header strip. Three columns: left eyebrow + title,
 * right freshness meta. Renders at every dashboard load.
 *
 * Right-meta is the page-level freshness anchor for R.2's locked pattern.
 * The canonical formatFreshness helper lands in T7; T1 ships an inline
 * approximation the caller computes from summarizeTrustStrip + formatRelative.
 */
export function PageHeader({
  todayLabel,
  freshnessHeadline,
  freshnessCaveat,
}: {
  /** "Today · Sat, May 10" eyebrow text (computed by caller server-side). */
  todayLabel: string;
  /** "Fresh 2h ago · 3 sources" — from T7's formatFreshness. */
  freshnessHeadline: string;
  /** Optional caveat — null in healthy state. */
  freshnessCaveat: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          {todayLabel}
        </div>
        <h1
          className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          Dashboard
        </h1>
      </div>
      <div className="hidden text-right text-xs text-[--text-2] sm:block">
        <div>{freshnessHeadline}</div>
        {freshnessCaveat && (
          <div className="mt-0.5 text-[--text-3]">{freshnessCaveat}</div>
        )}
      </div>
    </header>
  );
}
