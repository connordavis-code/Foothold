'use client';

import { MobileList } from '@/components/operator/mobile-list';
import type { DriftFlag } from '@/lib/db/queries/drift';
import { humanizeCategory } from '@/lib/format/category';
import { formatCurrency } from '@/lib/utils';

// Mobile flag-history list. Lives in a client component so the
// MobileList config (functions) doesn't cross the server→client
// boundary — RSC refuses to serialize functions. The desktop
// table still renders from the server component on /drift.
export function FlagHistoryList({ flags }: { flags: DriftFlag[] }) {
  return (
    <MobileList<DriftFlag>
      rows={flags}
      config={{
        rowKey: (f) => `${f.weekEnd}-${f.category}`,
        dateField: (f) => f.weekEnd,
        topLine: (f) => humanizeCategory(f.category),
        secondLine: (f) =>
          `vs ${formatCurrency(f.baselineWeekly)} baseline · ${f.ratio.toFixed(1)}×`,
        rightCell: (f) => formatCurrency(f.currentTotal),
        rowHref: (f) =>
          `/transactions?category=${encodeURIComponent(f.category)}&from=${f.weekStart}&to=${f.weekEnd}`,
      }}
    />
  );
}
