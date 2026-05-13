import { eq, inArray } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { financialAccounts, users } from '@/lib/db/schema';
import { getSourceHealth } from '@/lib/db/queries/health';
import { snaptradeConfigured } from '@/lib/snaptrade/client';
import { ConnectedAccountsSection } from '@/components/settings/connected-accounts-section';
import { DangerZoneSection } from '@/components/settings/danger-zone-section';
import { DataExportSection } from '@/components/settings/data-export-section';
import { ProfileSection } from '@/components/settings/profile-section';
import { SettingsRail, type RailSection } from '@/components/settings/settings-rail';

const RAIL_SECTIONS: ReadonlyArray<RailSection> = [
  { id: 'profile', label: 'Profile' },
  { id: 'connected', label: 'Connected accounts' },
  { id: 'export', label: 'Data & export' },
  { id: 'danger', label: 'Danger zone' },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  const [profileRow] = await db
    .select({ name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const sources = await getSourceHealth(session.user.id);

  const accounts = sources.length
    ? await db
        .select()
        .from(financialAccounts)
        .where(
          inArray(
            financialAccounts.itemId,
            sources.map((s) => s.itemId),
          ),
        )
    : [];

  const accountsByItem = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const list = accountsByItem.get(a.itemId) ?? [];
    list.push(a);
    accountsByItem.set(a.itemId, list);
  }

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-8">
      <h1
        className="font-display italic text-3xl text-foreground md:text-4xl"
        style={{ letterSpacing: '-0.02em' }}
      >
        Settings
      </h1>

      <div className="flex gap-8">
        <SettingsRail sections={RAIL_SECTIONS} />

        <div className="flex-1 min-w-0 space-y-6">
          <section id="profile">
            <ProfileSection
              email={session.user.email}
              initialDisplayName={profileRow?.name ?? null}
              initialTimezone={profileRow?.timezone ?? 'UTC'}
            />
          </section>

          <section id="connected">
            <ConnectedAccountsSection
              sources={sources}
              accountsByItem={accountsByItem}
              snaptradeEnabled={snaptradeConfigured()}
            />
          </section>

          <section id="export">
            <DataExportSection />
          </section>

          <section id="danger">
            <DangerZoneSection userEmail={session.user.email} />
          </section>
        </div>
      </div>
    </div>
  );
}
