'use client';

import { X } from 'lucide-react';
import {
  addItem,
  removeItem,
  updateItem,
} from '@/lib/forecast/override-helpers';
import type { ForecastHistory, ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['goalTargetEdits'];
  onChange: (next: ScenarioOverrides['goalTargetEdits']) => void;
  realGoals: ForecastHistory['goals'];
};

export function GoalTargetOverrides({ value, onChange, realGoals }: Props) {
  const items = value ?? [];
  const usedIds = new Set(items.map((i) => i.goalId));
  const availableGoals = realGoals.filter((g) => !usedIds.has(g.id));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const goal = realGoals.find((g) => g.id === item.goalId);
        return (
          <div key={item.goalId} className="bg-muted/30 rounded-card p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground text-sm">
                {goal?.name ?? '(unknown)'}
              </span>
              <button
                onClick={() => onChange(removeItem(items, (i) => i.goalId === item.goalId))}
                className="p-1 text-text-3 hover:text-destructive"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-3">Target $</span>
              <input
                type="number"
                min={0}
                value={item.newTargetAmount ?? goal?.targetAmount ?? 0}
                onChange={(e) =>
                  onChange(updateItem(items, (i) => i.goalId === item.goalId, {
                    newTargetAmount: Math.max(0, Number(e.target.value)) || 0,
                  }))
                }
                className="w-24 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
              />
              <span className="text-text-3">@ $</span>
              <input
                type="number"
                min={0}
                value={item.newMonthlyContribution ?? goal?.monthlyContribution ?? 0}
                onChange={(e) =>
                  onChange(updateItem(items, (i) => i.goalId === item.goalId, {
                    newMonthlyContribution: Math.max(0, Number(e.target.value)) || 0,
                  }))
                }
                className="w-20 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
              />
              <span className="text-text-3">/mo</span>
            </div>
          </div>
        );
      })}

      {availableGoals.length > 0 ? (
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            onChange(addItem(items, { goalId: id }));
          }}
          className="w-full bg-background border border-dashed border-hairline rounded-btn px-2 py-1.5 text-text-3 hover:text-foreground"
        >
          <option value="">+ edit a real goal</option>
          {availableGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : realGoals.length === 0 ? (
        <div className="text-xs text-text-3/60 italic">
          No real goals to edit yet.
        </div>
      ) : (
        <div className="text-xs text-text-3/60 italic">
          All real goals already have edits.
        </div>
      )}
    </div>
  );
}
