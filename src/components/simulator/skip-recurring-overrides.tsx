'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItemAt,
  updateItemAt,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
            <Select
              value={item.streamId}
              onValueChange={(v) =>
                onChange(updateItemAt(items, i, { streamId: v }))
              }
            >
              <SelectTrigger className="flex-1 bg-background border border-hairline rounded-btn px-2 py-1 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {baseStreams.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-text-3">in</span>
            <Select
              value={item.skipMonth}
              onValueChange={(v) =>
                onChange(updateItemAt(items, i, { skipMonth: v }))
              }
            >
              <SelectTrigger className="bg-background border border-hairline rounded-btn px-2 py-1 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => onChange(removeItemAt(items, i))}
              className="p-1 text-text-3 hover:text-destructive"
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
          className="w-full text-left text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1.5"
        >
          + add skip
        </button>
      ) : (
        <div className="text-xs text-text-3/60 italic">
          No recurring streams to skip.
        </div>
      )}
    </div>
  );
}
