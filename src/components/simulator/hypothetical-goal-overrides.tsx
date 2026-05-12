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
        <div key={item.id} className="bg-muted/30 rounded-card p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={item.name}
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, { name: e.target.value }))
              }
              placeholder="Goal name"
              className="flex-1 bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
            />
            <button
              onClick={() => onChange(removeItem(items, (i) => i.id === item.id))}
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
              value={item.targetAmount === 0 ? '' : item.targetAmount}
              placeholder="0"
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  targetAmount: Math.max(0, Number(e.target.value)) || 0,
                }))
              }
              className="w-24 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
            />
            <span className="text-text-3">@ $</span>
            <input
              type="number"
              min={0}
              value={
                item.monthlyContribution === 0 || item.monthlyContribution === undefined
                  ? ''
                  : item.monthlyContribution
              }
              placeholder="0"
              onChange={(e) =>
                onChange(updateItem(items, (i) => i.id === item.id, {
                  monthlyContribution: Math.max(0, Number(e.target.value)) || 0,
                }))
              }
              className="w-20 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
            />
            <span className="text-text-3">/mo</span>
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          // Stub a hypothetical with zeros so the projection is untouched
          // until the user fills it in. zod requires targetAmount > 0 on save,
          // so an unfilled stub will be flagged at save-time rather than
          // silently distorting the forecast.
          onChange(addItem(items, {
            id: newGoalId(),
            name: '',
            targetAmount: 0,
            monthlyContribution: 0,
          }))
        }
        className="w-full text-left text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1.5"
      >
        + add hypothetical goal
      </button>
    </div>
  );
}
