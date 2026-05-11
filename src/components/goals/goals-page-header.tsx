/**
 * /goals page header — mirrors the dashboard <PageHeader> from R.2 with
 * route-specific copy. Eyebrow + h1 (left) + freshness meta (right).
 * Page sub line ("Targets you've committed to.") renders below in
 * page.tsx, not here, to keep this component layout-pure.
 */
export function GoalsPageHeader({
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
          Plan
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[--text]">
          Goals
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
