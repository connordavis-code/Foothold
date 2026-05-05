'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['lumpSums'];
  onChange: (next: ScenarioOverrides['lumpSums']) => void;
  /** YYYY-MM strings the user can pick from (= projection horizon months). */
  availableMonths: string[];
};

const newLumpId = () => `lump-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function LumpSumOverrides({ value, onChange, availableMonths }: Props) {
  const items = value ?? [];

  const addNew = () => {
    // amount: 0 is the deliberate no-op default; the user fills it in.
    onChange(
      addItem(items, {
        id: newLumpId(),
        label: '',
        amount: 0,
        month: availableMonths[0] ?? '2026-01',
      }),
    );
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        // Stacked: label on its own row (full width), then month+amount+remove on
        // a second row. Single-row layout overflowed the 260px override column.
        <div key={item.id} className="bg-muted/30 rounded p-2 space-y-1.5">
          <input
            type="text"
            value={item.label}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { label: e.target.value }))
            }
            className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
            placeholder="Label"
          />
          <div className="flex items-center gap-1.5">
            <select
              value={item.month}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, { month: e.target.value }))
              }
              className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-foreground"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              type="number"
              // Show placeholder when amount is 0 so an unfilled stub is
              // visually distinct from a deliberate $0. lumpSums.amount has
              // no zod sign constraint (it's signed) so we don't clamp here.
              value={item.amount === 0 ? '' : item.amount}
              placeholder="0"
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, { amount: Number(e.target.value) }))
              }
              className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <button
              onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={addNew}
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add lump sum
      </button>
    </div>
  );
}
