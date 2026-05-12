'use client';

import { formatCurrency } from '@/lib/utils';
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
        className="w-full text-left text-text-3 hover:text-foreground bg-background border border-dashed border-hairline rounded-btn px-2 py-1.5"
      >
        + add income delta
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-text-3">Monthly Δ $</span>
        <input
          type="number"
          value={value.monthlyDelta === 0 ? '' : value.monthlyDelta}
          placeholder="0"
          onChange={(e) => onChange({ ...value, monthlyDelta: Number(e.target.value) })}
          className="flex-1 bg-background border border-hairline rounded-btn px-2 py-1 text-right text-foreground"
        />
        <button
          onClick={() => onChange(undefined)}
          className="text-xs text-text-3 hover:text-destructive"
        >
          remove
        </button>
      </div>
      {value.monthlyDelta !== 0 && (
        <div className="text-[11px] text-text-3 pl-1">
          {formatCurrency(value.monthlyDelta * 12, { signed: true })}/yr
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-3">From</span>
        <select
          value={value.startMonth ?? ''}
          onChange={(e) => onChange({ ...value, startMonth: e.target.value || undefined })}
          className="bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
        >
          <option value="">always</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-text-3">to</span>
        <select
          value={value.endMonth ?? ''}
          onChange={(e) => onChange({ ...value, endMonth: e.target.value || undefined })}
          className="bg-background border border-hairline rounded-btn px-2 py-1 text-foreground"
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
