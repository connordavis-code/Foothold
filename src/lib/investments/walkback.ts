export type WalkbackTxn = {
  date: string; // YYYY-MM-DD
  amount: number; // Plaid sign: positive = cash OUT of broker
  type: string; // 'transfer' | 'cash' | 'fee' | 'buy' | etc.
};

export type WalkbackPoint = {
  date: string; // YYYY-MM-DD
  value: number;
  estimated: true;
};

// External-cash-flow types only. Buys/sells/dividends/cancels are
// internal asset class changes at the broker (security ↔ cash sweep)
// and are zero-sum at the portfolio-total level. Per
// [src/components/investments/investment-txns-table.tsx]:
// "Plaid sign convention on investment txns: positive amount = cash
// OUT of the account (a buy), negative = cash IN (sell, dividend)."
// That sign convention is cash-sweep-oriented, not portfolio-oriented,
// so we only walk back the txn types that actually move money in/out
// of the broker.
const ALLOWED_TYPES = new Set(['transfer', 'cash', 'fee']);

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Walk back portfolio totals from `currentValue` at `today` through
 * `daysBack` calendar days. Each day's net signed amount of allowed-
 * type txns is added to the running value (positive amount = cash
 * left broker → yesterday had MORE before the outflow). All points
 * carry `estimated: true` so callers can distinguish from real
 * snapshot values.
 *
 * Output sorted oldest-first ascending; includes both endpoints
 * (today + (today − daysBack days)) inclusive.
 */
export function walkbackPortfolio(
  currentValue: number,
  txns: WalkbackTxn[],
  daysBack: number,
  today: Date,
): WalkbackPoint[] {
  const dailyNet = new Map<string, number>();
  for (const t of txns) {
    if (!ALLOWED_TYPES.has(t.type)) continue;
    dailyNet.set(t.date, (dailyNet.get(t.date) ?? 0) + t.amount);
  }

  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  const points: WalkbackPoint[] = [];
  let running = currentValue;
  for (let i = 0; i <= daysBack; i++) {
    const dayMs = todayMs - i * 86_400_000;
    const dayIso = toIsoDate(new Date(dayMs));
    points.push({ date: dayIso, value: running, estimated: true });
    running += dailyNet.get(dayIso) ?? 0;
  }
  return points.reverse();
}
