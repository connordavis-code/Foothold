import type { InsightSupplements } from '@/lib/insights/types';
import { getVisibleTiles, tileGridIsSingleColumn } from '@/lib/insights/tile-visibility';
import { cn } from '@/lib/utils';
import { SpendingTile } from './tiles/spending-tile';
import { DriftTile } from './tiles/drift-tile';
import { GoalsTile } from './tiles/goals-tile';
import { RecurringTile } from './tiles/recurring-tile';

type Props = {
  supplements: InsightSupplements;
};

export function ReceiptsSection({ supplements }: Props) {
  const visible = getVisibleTiles(supplements);
  const singleCol = tileGridIsSingleColumn(visible);
  return (
    <section className="space-y-3">
      <p className="text-eyebrow">
        What Claude saw
      </p>
      <div
        className={cn('grid gap-3', singleCol ? 'grid-cols-1' : 'sm:grid-cols-2')}
      >
        <SpendingTile data={supplements.spending} />
        {visible.drift && <DriftTile data={supplements.drift} />}
        {visible.goals && <GoalsTile data={supplements.goals} />}
        {visible.recurring && <RecurringTile data={supplements.recurring} />}
      </div>
    </section>
  );
}
