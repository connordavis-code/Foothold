import { formatCurrencyCompact } from '@/lib/utils';
import type { RecurringStreamRow } from '@/lib/db/queries/recurring';

/**
 * Minimal structural shape a move row needs to render a summary. Both
 * `goal_move` and `scenario_move` rows satisfy it — the summary depends only
 * on `templateKey` + `params`, never the parent id or goal-side `source`.
 */
export type SummarisableMove = { templateKey: string; params: unknown };

type CategoryOption = { key: string; label: string };

// YYYY-MM → "Jan 2026". Construct in LOCAL time from parts — a date-only ISO
// string ("2026-09-01") parses as UTC midnight, which toLocaleDateString then
// shifts back a day (and sometimes a month) for any browser behind UTC. The
// (year, monthIndex, 1) constructor is local, so the rendered month is stable.
function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return '';
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Human-readable one-line summary of a move, shared by the goal-side and
 * scenario-side attached-move rows. Falls back to "(unknown …)" labels when a
 * referenced stream/category can't be resolved (e.g. a stream was deleted
 * after the move was attached) so the row never renders a raw id.
 */
export function formatMoveSummary(
  move: SummarisableMove,
  streams: RecurringStreamRow[],
  categories: CategoryOption[],
): string {
  const params = (move.params ?? {}) as Record<string, unknown>;

  const startMonth = formatMonth(
    typeof params.startMonth === 'string' ? params.startMonth : '',
  );
  const endMonth =
    typeof params.endMonth === 'string' ? formatMonth(params.endMonth) : undefined;
  const endWindow = endMonth ? ` to ${endMonth}` : '';

  if (move.templateKey === 'adjust-recurring') {
    const streamId = typeof params.streamId === 'string' ? params.streamId : undefined;
    const newAmount = typeof params.newAmount === 'number' ? params.newAmount : 0;
    const stream = streamId ? streams.find((s) => s.id === streamId) : undefined;
    const streamName = stream?.merchantName || stream?.description || '(unknown stream)';
    return `Adjust ${streamName} to ${formatCurrencyCompact(newAmount)}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'reduce-category') {
    const categoryKey = typeof params.categoryKey === 'string' ? params.categoryKey : undefined;
    const deltaAmount = typeof params.deltaAmount === 'number' ? params.deltaAmount : 0;
    const category = categoryKey ? categories.find((c) => c.key === categoryKey) : undefined;
    const categoryLabel = category?.label || '(unknown category)';
    return `Reduce ${categoryLabel} by ${formatCurrencyCompact(deltaAmount)}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'income-event') {
    const monthlyAmount = typeof params.monthlyAmount === 'number' ? params.monthlyAmount : 0;
    const label = typeof params.label === 'string' ? params.label : 'Income event';
    const sign = monthlyAmount >= 0 ? '+' : '';
    return `${label}: ${sign}${formatCurrencyCompact(monthlyAmount)}/mo from ${startMonth}${endWindow}`;
  }

  if (move.templateKey === 'skip-once') {
    const streamId = typeof params.streamId === 'string' ? params.streamId : undefined;
    const month = typeof params.month === 'string' ? params.month : '';
    const stream = streamId ? streams.find((s) => s.id === streamId) : undefined;
    const streamName = stream?.merchantName || stream?.description || '(unknown stream)';
    return `Skip ${streamName} in ${formatMonth(month)}`;
  }

  return 'Unknown move';
}
