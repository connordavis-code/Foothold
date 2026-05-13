import Link from 'next/link';
import { ArrowRight, Repeat } from 'lucide-react';
import { auth } from '@/auth';
import { CalendarWindows } from '@/components/recurring/calendar-windows';
import { CancelledArchiveList } from '@/components/recurring/cancelled-archive-list';
import { HikeAlertBanner } from '@/components/recurring/hike-alert-banner';
import { InflowsSection } from '@/components/recurring/inflows-section';
import { RecentlyCancelledSection } from '@/components/recurring/recently-cancelled-section';
import { RecurringPageHeader } from '@/components/recurring/recurring-page-header';
import { RecurringSummaryStrip } from '@/components/recurring/recurring-summary-strip';
import { RecurringTabs } from '@/components/recurring/recurring-tabs';
import { Button } from '@/components/ui/button';
import { getSourceHealth } from '@/lib/db/queries/health';
import {
  frequencyToMonthlyMultiplier,
  getMonthlyRecurringOutflow,
  getRecurringStreams,
  type RecurringStreamRow,
} from '@/lib/db/queries/recurring';
import { formatFreshness } from '@/lib/format/freshness';
import {
  groupByDateWindow,
  pickNextCharge,
} from '@/lib/recurring/calendar-windows';
import { isHikeAlert } from '@/lib/recurring/analysis';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function RecurringPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [streams, monthlyOutflow, sourceHealth] = await Promise.all([
    getRecurringStreams(session.user.id),
    getMonthlyRecurringOutflow(session.user.id),
    getSourceHealth(session.user.id),
  ]);

  if (streams.length === 0) {
    return <EmptyState />;
  }

  const today = new Date();

  const activeOutflows = streams.filter(
    (s) => s.direction === 'outflow' && s.isActive,
  );
  const activeInflows = streams.filter(
    (s) => s.direction === 'inflow' && s.isActive,
  );
  const hikes = activeOutflows.filter(isHikeAlert);
  const recentCancelled = streams
    .filter(isRecentlyCancelled)
    .sort(byLastDateDesc);
  const allCancelled = streams
    .filter((s) => s.status === 'TOMBSTONED')
    .sort(byLastDateDesc);

  const windows = groupByDateWindow(activeOutflows, today);
  const nextCharge = pickNextCharge(activeOutflows, today);

  const monthlyInflow = activeInflows.reduce((sum, s) => {
    if (s.averageAmount == null) return sum;
    return (
      sum +
      Math.abs(s.averageAmount) *
        frequencyToMonthlyMultiplier(s.frequency)
    );
  }, 0);
  const netMonthly = monthlyInflow - monthlyOutflow;

  const freshness = formatFreshness({
    sources: sourceHealth.map((s) => ({
      name: s.institutionName ?? 'Source',
      lastSyncAt: s.lastSuccessfulSyncAt,
    })),
    now: today,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <RecurringPageHeader
        freshnessHeadline={freshness.headline}
        freshnessCaveat={freshness.caveat}
      />
      <p className="text-sm text-[--text-2]">
        The monthly charges that move on autopilot.
      </p>
      <RecurringSummaryStrip
        monthlyOutflow={monthlyOutflow}
        netMonthly={netMonthly}
        activeOutflowCount={activeOutflows.length}
        nextCharge={nextCharge}
      />
      <RecurringTabs
        active={
          <div className="space-y-6">
            {hikes.length > 0 && <HikeAlertBanner streams={hikes} />}
            <CalendarWindows windows={windows} />
            {activeInflows.length > 0 && (
              <InflowsSection streams={activeInflows} />
            )}
            {recentCancelled.length > 0 && (
              <RecentlyCancelledSection streams={recentCancelled} />
            )}
          </div>
        }
        cancelled={<CancelledArchiveList streams={allCancelled} />}
      />
    </div>
  );
}

function isRecentlyCancelled(stream: RecurringStreamRow): boolean {
  if (stream.status !== 'TOMBSTONED') return false;
  if (!stream.lastDate) return false;
  const last = Date.parse(stream.lastDate);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= NINETY_DAYS_MS;
}

function byLastDateDesc(a: RecurringStreamRow, b: RecurringStreamRow): number {
  return (
    Date.parse(b.lastDate ?? '1970-01-01') -
    Date.parse(a.lastDate ?? '1970-01-01')
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="space-y-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-[--surface] text-[--text-2]">
          <Repeat className="h-6 w-6" />
        </span>
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-semibold italic tracking-tight text-[--text]">
            Not enough history yet
          </h1>
          <p className="mx-auto max-w-md text-sm text-[--text-2]">
            Plaid needs 60–90 days of transaction data to detect
            subscriptions, payroll, and bills. Connecting more accounts
            shortens the wait.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/settings">
              Connect more accounts
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
