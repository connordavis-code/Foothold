'use client';

import { X } from 'lucide-react';
import { addItem } from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type RecurringChange = NonNullable<ScenarioOverrides['recurringChanges']>[number];

type Props = {
  value: ScenarioOverrides['recurringChanges'];
  onChange: (next: ScenarioOverrides['recurringChanges']) => void;
  /** Real recurring streams from history; used for the pause/edit dropdown. */
  baseStreams: ForecastHistory['recurringStreams'];
};

const changeKey = (c: RecurringChange, i: number) =>
  `${c.action}-${c.streamId ?? 'new'}-${i}`;

// Index-based helpers (the shared helpers are predicate-based; we need index here
// because duplicate entries with the same streamId would otherwise collide).
function removeAtIndex(
  arr: RecurringChange[],
  i: number,
): RecurringChange[] | undefined {
  const next = arr.filter((_, idx) => idx !== i);
  return next.length === 0 ? undefined : next;
}

function patchAtIndex(
  arr: RecurringChange[],
  i: number,
  patch: Partial<RecurringChange>,
): RecurringChange[] {
  return arr.map((item, idx) => (idx === i ? { ...item, ...patch } : item));
}

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
    onChange(
      addItem(items, {
        action: 'add',
        label: 'New stream',
        amount: 100,
        direction: 'outflow',
        cadence: 'monthly',
      }),
    );
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={changeKey(item, i)} className="bg-muted/30 rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {item.action}
            </span>
            <button
              onClick={() => onChange(removeAtIndex(items, i))}
              className="p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {(item.action === 'pause' || item.action === 'edit') && (
            <select
              value={item.streamId ?? ''}
              onChange={(e) =>
                onChange(patchAtIndex(items, i, { streamId: e.target.value }))
              }
              className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {baseStreams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} (${s.amount} {s.cadence})
                </option>
              ))}
            </select>
          )}

          {(item.action === 'edit' || item.action === 'add') && (
            <div className="flex gap-1.5">
              {item.action === 'add' && (
                <input
                  type="text"
                  value={item.label ?? ''}
                  onChange={(e) =>
                    onChange(patchAtIndex(items, i, { label: e.target.value }))
                  }
                  placeholder="Label"
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
                />
              )}
              <input
                type="number"
                value={item.amount ?? 0}
                onChange={(e) =>
                  onChange(patchAtIndex(items, i, { amount: Number(e.target.value) }))
                }
                className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
              />
              <select
                value={item.cadence ?? 'monthly'}
                onChange={(e) =>
                  onChange(
                    patchAtIndex(items, i, {
                      cadence: e.target.value as 'weekly' | 'biweekly' | 'monthly',
                    }),
                  )
                }
                className="bg-background border border-border rounded px-2 py-1 text-foreground"
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
                      patchAtIndex(items, i, {
                        direction: e.target.value as 'inflow' | 'outflow',
                      }),
                    )
                  }
                  className="bg-background border border-border rounded px-2 py-1 text-foreground"
                >
                  <option value="outflow">out</option>
                  <option value="inflow">in</option>
                </select>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-1.5">
        <button
          onClick={addPause}
          disabled={baseStreams.length === 0}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 disabled:opacity-50 text-xs"
        >
          + pause
        </button>
        <button
          onClick={addEdit}
          disabled={baseStreams.length === 0}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 disabled:opacity-50 text-xs"
        >
          + edit
        </button>
        <button
          onClick={addNew}
          className="flex-1 text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1 text-xs"
        >
          + add new
        </button>
      </div>
    </div>
  );
}
