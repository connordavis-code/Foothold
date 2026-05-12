'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import { formatCurrency } from '@/lib/utils';
import type { ScenarioOverrides } from '@/lib/forecast/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
        const annual = item.monthlyDelta * 12;
        return (
          <div key={item.categoryId} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-foreground">{cat?.name ?? item.categoryId}</span>
              <span className="text-text-3">$</span>
              <input
                type="number"
                value={item.monthlyDelta === 0 ? '' : item.monthlyDelta}
                placeholder="0"
                onChange={(e) =>
                  onChange(
                    updateItem(
                      items,
                      (i) => i.categoryId === item.categoryId,
                      { monthlyDelta: Number(e.target.value) },
                    ),
                  )
                }
                className="w-24 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
              />
              <span className="text-text-3 text-xs">/mo</span>
              <button
                onClick={() =>
                  onChange(removeItem(items, (i) => i.categoryId === item.categoryId))
                }
                className="p-1 text-text-3 hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {annual !== 0 && (
              <div className="text-[11px] text-text-3 pl-1">
                {formatCurrency(annual, { signed: true })}/yr
              </div>
            )}
          </div>
        );
      })}

      {availableCategories.length > 0 ? (
        <Select
          value=""
          onValueChange={(id) => {
            if (!id) return;
            onChange(addItem(items, { categoryId: id, monthlyDelta: 0 }));
          }}
        >
          <SelectTrigger className="w-full bg-background border border-dashed border-hairline rounded-btn px-2 py-1.5 text-text-3 hover:text-foreground">
            <SelectValue placeholder="+ add category override" />
          </SelectTrigger>
          <SelectContent>
            {availableCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="text-xs text-text-3/60 italic">
          All known categories already overridden.
        </div>
      )}
    </div>
  );
}
