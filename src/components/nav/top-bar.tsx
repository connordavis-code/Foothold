import { signOut } from '@/auth';
import { PaletteTrigger } from '@/components/command-palette/palette-trigger';
import { getSyncStatus } from '@/lib/db/queries/sync';
import { PageTitle } from './page-title';
import { SyncPill } from './sync-pill';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

type Props = {
  userId: string;
  email: string;
};

/**
 * Sticky top bar. Composes:
 *  - Left: page title (resolved client-side from pathname)
 *  - Center: ⌘K command-palette trigger (search-styled button)
 *  - Right: sync pill + user avatar dropdown
 *
 * Server component so the sync-status query runs on the request, not the
 * client. The palette itself is mounted globally by the layout's
 * <CommandPaletteProvider>; the trigger here just opens it.
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--hairline)] bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:gap-3 md:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <PageTitle />
      </div>
      <div className="hidden flex-1 justify-center px-2 md:flex">
        <PaletteTrigger />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
        <SyncPill
          lastSyncedAt={status.lastSyncedAt?.toISOString() ?? null}
          reauthCount={status.reauthCount}
        />
        <ThemeToggle />
        <UserMenu email={email} signOutAction={handleSignOut} />
      </div>
    </header>
  );
}
