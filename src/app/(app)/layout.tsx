import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { CommandPaletteProvider } from '@/components/command-palette/palette-context';
import { CheatsheetDialog } from '@/components/keyboard/cheatsheet-dialog';
import { AppSidebar } from '@/components/nav/app-sidebar';
import { MobileTabBar } from '@/components/nav/mobile-tab-bar';
import { SignatureFooter } from '@/components/nav/signature-footer';
import { TopBar } from '@/components/nav/top-bar';
import { Toaster } from '@/components/ui/sonner';

/**
 * Protected app shell. Sidebar + sticky top bar + content + global
 * ⌘K command palette. Middleware already enforces auth; this `auth()`
 * call is defense-in-depth and supplies the session to the top-bar
 * user menu.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect('/login');
  }

  return (
    <CommandPaletteProvider>
      <div className="flex min-h-screen bg-surface-paper">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar userId={session.user.id} email={session.user.email} />
          <main className="flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
            <SignatureFooter />
          </main>
        </div>
        <MobileTabBar />
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          mobileOffset={{
            bottom: 'calc(4rem + env(safe-area-inset-bottom))',
            right: '1rem',
          }}
        />
        <CommandPalette />
        <CheatsheetDialog />
      </div>
    </CommandPaletteProvider>
  );
}
