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
    onChange(
      addItem(items, {
        id: newLumpId(),
        label: 'Lump sum',
        amount: 0,
        month: availableMonths[0] ?? '2026-01',
      }),
    );
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          <input
            type="text"
            value={item.label}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { label: e.target.value }))
            }
            className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            placeholder="Label"
          />
          <select
            value={item.month}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { month: e.target.value }))
            }
            className="bg-background border border-border rounded px-2 py-1 text-foreground"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={item.amount}
            onChange={(e) =>
              onChange(updateItem(items, (i) => i.id === item.id, { amount: Number(e.target.value) }))
            }
            className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
          />
          <button
            onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
            className="p-1 text-muted-foreground hover:text-destructive"
            aria-label="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
