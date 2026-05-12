/**
 * /transactions page header. Mirrors <RecurringPageHeader> + <GoalsPageHeader>
 * pattern from R.3.1/R.3.2. Eyebrow "Records" + h1 "Transactions" (left)
 * + freshness meta (right). Page sub-line is rendered by page.tsx in T7
 * if needed (currently we lean on the KPI strip to do the talking).
 */
export function TransactionsPageHeader({
  freshnessHeadline,
  freshnessCaveat,
}: {
  freshnessHeadline: string;
  freshnessCaveat: string | null;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-[--text-3]">
          Records
        </div>
        <h1
          className="mt-1 font-display italic text-3xl text-foreground md:text-4xl"
          style={{ letterSpacing: "-0.02em" }}
        >
          Transactions
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
