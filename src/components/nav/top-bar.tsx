import { signOut } from '@/auth';
import { getSyncStatus } from '@/lib/db/queries/sync';
import { PageTitle } from './page-title';
import { SyncPill } from './sync-pill';
import { UserMenu } from './user-menu';

type Props = {
  userId: string;
  email: string;
};

/**
 * Sticky top bar. Composes:
 *  - Left: page title (resolved client-side from pathname)
 *  - Right: sync pill + user avatar dropdown
 *
 * Server component so the sync-status query runs on the request, not the
 * client. The middle (⌘K palette trigger) is reserved for Phase 6.2 — a
 * placeholder spacer keeps the layout stable when it lands.
 */
export async function TopBar({ userId, email }: Props) {
  const status = await getSyncStatus(userId);

  // Server-action closure carries the redirect intent across the
  // client→server boundary in user-menu.tsx without bundling auth
  // internals into client code.
  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-6">
      <PageTitle />
      <div className="flex-1" aria-hidden />
      <SyncPill
        lastSyncedAt={status.lastSyncedAt?.toISOString() ?? null}
        reauthCount={status.reauthCount}
      />
      <UserMenu email={email} signOutAction={handleSignOut} />
    </header>
  );
}
