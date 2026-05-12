/**
 * /investments page header. Mirrors <RecurringPageHeader> /
 * <TransactionsPageHeader> structure: eyebrow + h1 + page sub on the
 * left, freshness meta on the right.
 *
 * Eyebrow says "Long horizon" (per R.3.4 SPEC #6) — the only R.3
 * sub-phase where eyebrow diverges from the sidebar group (investments
 * sits under Records, but the brand voice for this page is
 * long-horizon).
 */
export function InvestmentsPageHeader({
  freshnessHeadline,
  freshnessCaveat,
}: {
  freshnessHeadline: string;
  freshnessCaveat: string | null;
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
            Long horizon
          </div>
          <h1
            className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
            style={{ letterSpacing: "-0.02em" }}
          >
            Investments
          </h1>
        </div>
        <div className="hidden text-right text-xs text-[--text-2] sm:block">
          <div>{freshnessHeadline}</div>
          {freshnessCaveat && (
            <div className="mt-0.5 text-[--text-3]">{freshnessCaveat}</div>
          )}
        </div>
      </div>
      <p className="max-w-xl text-sm text-[--text-2]">
        Where your money is working. Quiet by design — markets move, but the
        plan doesn't.
      </p>
    </header>
  );
}
