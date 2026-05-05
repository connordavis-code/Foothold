'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['hypotheticalGoals'];
  onChange: (next: ScenarioOverrides['hypotheticalGoals']) => void;
};

const newGoalId = () => `hyp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function HypotheticalGoalOverrides({ value, onChange }: Props) {
  const items = value ?? [];

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="bg-muted/30 rounded p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={item.name}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, { name: e.target.value }))
              }
              placeholder="Goal name"
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-foreground"
            />
            <button
              onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
              className="p-1 text-muted-foreground hover:text-destructive"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Target $</span>
            <input
              type="number"
              value={item.targetAmount}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  targetAmount: Number(e.target.value),
                }))
              }
              className="w-24 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground">@ $</span>
            <input
              type="number"
              value={item.monthlyContribution ?? 0}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  monthlyContribution: Number(e.target.value),
                }))
              }
              className="w-20 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
            />
            <span className="text-muted-foreground">/mo</span>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          onChange(addItem(items, {
            id: newGoalId(),
            name: 'New goal',
            targetAmount: 1000,
            monthlyContribution: 100,
          }))
        }
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add hypothetical goal
      </button>
    </div>
  );
}
