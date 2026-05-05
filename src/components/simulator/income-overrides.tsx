'use client';

import type { ScenarioOverrides } from '@/lib/forecast/types';

type Props = {
  value: ScenarioOverrides['incomeDelta'];
  onChange: (next: ScenarioOverrides['incomeDelta']) => void;
  availableMonths: string[];
};

export function IncomeOverrides({ value, onChange, availableMonths }: Props) {
  if (!value) {
    return (
      <button
        onClick={() => onChange({ monthlyDelta: 0 })}
        className="w-full text-left text-muted-foreground hover:text-foreground bg-background border border-dashed border-border rounded px-2 py-1.5"
      >
        + add income delta
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Monthly Δ $</span>
        <input
          type="number"
          value={value.monthlyDelta}
          onChange={(e) => onChange({ ...value, monthlyDelta: Number(e.target.value) })}
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-right text-foreground"
        />
        <button
          onClick={() => onChange(undefined)}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          remove
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">From</span>
        <select
          value={value.startMonth ?? ''}
          onChange={(e) => onChange({ ...value, startMonth: e.target.value || undefined })}
          className="bg-background border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">always</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-muted-foreground">to</span>
        <select
          value={value.endMonth ?? ''}
          onChange={(e) => onChange({ ...value, endMonth: e.target.value || undefined })}
          className="bg-background border border-border rounded px-2 py-1 text-foreground"
        >
          <option value="">end of horizon</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
