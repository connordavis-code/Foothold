'use client';

import type { RangeParam } from '@/lib/simulator/url-state';
import { cn } from '@/lib/utils';

type Props = {
  range: RangeParam;
  onChange: (r: RangeParam) => void;
};

const RANGES: RangeParam[] = ['1Y', '2Y'];

export function ChartRangeTabs({ range, onChange }: Props) {
  return (
    <div className="inline-flex rounded-pill border border-hairline">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            'rounded-pill px-3 py-1 text-xs',
            r === range
              ? 'bg-foreground text-background'
              : 'text-text-2 hover:text-foreground',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
