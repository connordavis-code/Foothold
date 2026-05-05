'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['categoryDeltas'];
  onChange: (next: ScenarioOverrides['categoryDeltas']) => void;
  /** Plaid PFC strings observed in the user's history, with prettified names. */
  knownCategories: Array<{ id: string; name: string }>;
};

export function CategoryOverrides({ value, onChange, knownCategories }: Props) {
  const items = value ?? [];
  const usedIds = new Set(items.map((i) => i.categoryId));
  const availableCategories = knownCategories.filter((c) => !usedIds.has(c.id));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const cat = knownCategories.find((c) => c.id === item.categoryId);
        return (
          <div key={item.categoryId} className="flex items-center gap-2">
            <span className="flex-1 text-foreground">{cat?.name ?? item.categoryId}</span>
            <span className="text-muted-foreground">$</span>
            <input
              type="number"
              value={item.monthlyDelta}
              onChange={(e) =>
                onChange(
                  updateItem(
                    items,
                    (i) => i.categoryId === item.categoryId,
                    { monthlyDelta: Number(e.target.value) },
                  ),
                )
              }
              className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground text-xs">/mo</span>
            <button
              onClick={() =>
                onChange(removeItem(items, (i) => i.categoryId === item.categoryId))
              }
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {availableCategories.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange(addItem(items, { categoryId: id, monthlyDelta: 0 }));
          }}
          className="w-full bg-background border border-dashed border-border rounded px-2 py-1.5 text-muted-foreground hover:text-foreground"
        >
          <option value="">+ add category override</option>
          {availableCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="text-xs text-muted-foreground/60 italic">
          All known categories already overridden.
        </div>
      )}
    </div>
  );
}
