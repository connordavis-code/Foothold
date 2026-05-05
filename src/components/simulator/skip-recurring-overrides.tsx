'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItemAt,
  updateItemAt,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['skipRecurringInstances'];
  onChange: (next: ScenarioOverrides['skipRecurringInstances']) => void;
  baseStreams: ForecastHistory['recurringStreams'];
  availableMonths: string[];
};

export function SkipRecurringOverrides({
  value, onChange, baseStreams, availableMonths,
}: Props) {
  const items = value ?? [];

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const stream = baseStreams.find((s) => s.id === item.streamId);
        return (
          <div key={`${item.streamId}-${item.skipMonth}-${i}`} className="flex items-center gap-2">
            <select
              value={item.streamId}
              onChange={(e) =>
                onChange(updateItemAt(items, i, { streamId: e.target.value }))
              }
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {baseStreams.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">in</span>
            <select
              value={item.skipMonth}
              onChange={(e) =>
                onChange(updateItemAt(items, i, { skipMonth: e.target.value }))
              }
              className="bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button
              onClick={() => onChange(removeItemAt(items, i))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {baseStreams.length > 0 ? (
        <button
          onClick={() =>
            onChange(addItem(items, {
              streamId: baseStreams[0].id,
              skipMonth: availableMonths[0] ?? '2026-01',
            }))
          }
          className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
        >
          + add skip
        </button>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">
          No recurring streams to skip.
        </div>
      )}
    </div>
  );
}
