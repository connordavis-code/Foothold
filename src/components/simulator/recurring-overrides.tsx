'use client';

import { X } from 'lucide-react';
import { addItem, removeItemAt, updateItemAt } from '@/lib/forecast/override-helpers';
import { formatCurrency } from '@/lib/utils';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

// 52w/y, 26 biweeklies/y, 12 months/y. Used to annualize amounts for the
// inline impact preview shown under each recurring row.
const cadenceFreq: Record<'weekly' | 'biweekly' | 'monthly', number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
};

type RecurringChange = NonNullable<ScenarioOverrides['recurringChanges']>[number];

type Props = {
  value: ScenarioOverrides['recurringChanges'];
  onChange: (next: ScenarioOverrides['recurringChanges']) => void;
  /** Real recurring streams from history; used for the pause/edit dropdown. */
  baseStreams: ForecastHistory['recurringStreams'];
};

const changeKey = (c: RecurringChange, i: number) =>
  `${c.action}-${c.streamId ?? 'new'}-${i}`;

export function RecurringOverrides({ value, onChange, baseStreams }: Props) {
  const items = value ?? [];

  const addPause = () => {
    if (baseStreams.length === 0) return;
    onChange(addItem(items, { streamId: baseStreams[0].id, action: 'pause' }));
  };
  const addEdit = () => {
    if (baseStreams.length === 0) return;
    onChange(
      addItem(items, {
        streamId: baseStreams[0].id,
        action: 'edit',
        amount: baseStreams[0].amount,
      }),
    );
  };
  const addNew = () => {
    // Default amount of 0 makes a freshly-added stub a no-op until the user
    // sets it — better than silently injecting an arbitrary $100/mo into
    // their projection if they forget to fill it in.
    onChange(
      addItem(items, {
        action: 'add',
        label: '',
        amount: 0,
        direction: 'outflow',
        cadence: 'monthly',
      }),
    );
  };

  // Annualized cash impact in dollars; positive = good for cash, negative =
  // bad. pause flips sign (pausing an outflow → cash IN). edit/add are
  // already signed by direction. null = not enough info to estimate.
  const impactPerYear = (item: RecurringChange): number | null => {
    const cadence = item.cadence ?? 'monthly';
    const freq = cadenceFreq[cadence];
    const stream = item.streamId
      ? baseStreams.find((s) => s.id === item.streamId)
      : null;
    if (item.action === 'pause' && stream) {
      const sign = stream.direction === 'outflow' ? +1 : -1;
      return sign * stream.amount * cadenceFreq[stream.cadence];
    }
    if (item.action === 'edit' && stream && item.amount !== undefined) {
      const sign = stream.direction === 'inflow' ? +1 : -1;
      return sign * (item.amount - stream.amount) * freq;
    }
    if (item.action === 'add' && item.amount !== undefined) {
      const sign = item.direction === 'inflow' ? +1 : -1;
      return sign * item.amount * freq;
    }
    return null;
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={changeKey(item, i)} className="bg-muted/30 rounded-card p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-text-3">
              {item.action}
            </span>
            <button
              onClick={() => onChange(removeItemAt(items, i))}
              className="p-0.5 text-text-3 hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {(item.action === 'pause' || item.action === 'edit') && (
            <select
              value={item.streamId ?? ''}
              onChange={(e) =>
                onChange(updateItemAt(items, i, { streamId: e.target.value }))
              }
              className="w-full bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
            >
              {baseStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} (${s.amount} {s.cadence})
                </option>
              ))}
            </select>
          )}

          {(item.action === 'edit' || item.action === 'add') && (
            // For 'add': label on its own row (full width), then amount + cadence
            // + direction. Single-row layout cramped the selects in the 260px
            // override column, making them effectively unclickable.
            <>
              {item.action === 'add' && (
                <input
                  type="text"
                  value={item.label ?? ''}
                  onChange={(e) =>
                    onChange(updateItemAt(items, i, { label: e.target.value }))
                  }
                  placeholder="Label"
                  className="w-full bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
                />
              )}
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={item.amount === 0 ? '' : (item.amount ?? '')}
                  placeholder="0"
                  onChange={(e) =>
                    // Recurring streams use a `direction` column for sign;
                    // amounts are magnitudes (zod: nonnegative). Clamp to ≥0
                    // so a stray minus key can't fail the save action later.
                    onChange(
                      updateItemAt(items, i, {
                        amount: Math.max(0, Number(e.target.value)) || 0,
                      }),
                    )
                  }
                  className="w-20 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
                />
                <select
                  value={item.cadence ?? 'monthly'}
                  onChange={(e) =>
                    onChange(
                      updateItemAt(items, i, {
                        cadence: e.target.value as 'weekly' | 'biweekly' | 'monthly',
                      }),
                    )
                  }
                  className="flex-1 min-w-0 bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
                >
                  <option value="weekly">weekly</option>
                  <option value="biweekly">biweekly</option>
                  <option value="monthly">monthly</option>
                </select>
                {item.action === 'add' && (
                  <select
                    value={item.direction ?? 'outflow'}
                    onChange={(e) =>
                      onChange(
                        updateItemAt(items, i, {
                          direction: e.target.value as 'inflow' | 'outflow',
                        }),
                      )
                    }
                    className="bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
                  >
                    <option value="outflow">out</option>
                    <option value="inflow">in</option>
                  </select>
                )}
              </div>
            </>
          )}

          {(() => {
            const annual = impactPerYear(item);
            if (annual === null || annual === 0) return null;
            return (
              <div className="text-[11px] text-text-3 pt-0.5">
                {formatCurrency(annual, { signed: true })}/yr
              </div>
            );
          })()}
        </div>
      ))}

      <div className="flex gap-1.5">
        <button
          onClick={addPause}
          disabled={baseStreams.length === 0}
          className="flex-1 text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1 disabled:opacity-50 text-xs"
        >
          + pause
        </button>
        <button
          onClick={addEdit}
          disabled={baseStreams.length === 0}
          className="flex-1 text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1 disabled:opacity-50 text-xs"
        >
          + edit
        </button>
        <button
          onClick={addNew}
          className="flex-1 text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1 text-xs"
        >
          + add new
        </button>
      </div>
    </div>
  );
}
