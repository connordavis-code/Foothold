type KpiCellProps = {
  label: string;
  value: string;
  sub: string;
};

function KpiCell({ label, value, sub }: KpiCellProps) {
  return (
    <div className="flex-1 rounded-card bg-[--surface] p-5">
      <div className="text-eyebrow-sm">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[--text]">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[--text-2]">{sub}</div>
    </div>
  );
}

type Props = {
  liquidBalance: number;
  liquidAccountCount: number;
  eomProjected: number;
  /** From computeRunway. Null = net-positive. */
  runwayWeeks: number | null;
};

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function Kpis({
  liquidBalance,
  liquidAccountCount,
  eomProjected,
  runwayWeeks,
}: Props) {
  const eomDelta = eomProjected - liquidBalance;
  const eomDeltaSign = eomDelta > 0 ? '+' : eomDelta < 0 ? '−' : '';

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <KpiCell
        label="Liquid Balance"
        value={fmtMoney(liquidBalance)}
        sub={`across ${liquidAccountCount} ${liquidAccountCount === 1 ? 'account' : 'accounts'}`}
      />
      <KpiCell
        label="EOM Projected"
        value={fmtMoney(eomProjected)}
        sub={`${eomDeltaSign}${fmtMoney(eomDelta)} from today`}
      />
      <KpiCell
        label="Runway"
        value={
          runwayWeeks === null ? 'Net positive' : `${Math.floor(runwayWeeks)} wks`
        }
        sub={runwayWeeks === null ? 'no runway risk' : 'at current burn'}
      />
    </div>
  );
}
