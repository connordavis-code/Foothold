import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AppSidebar } from '@/components/nav/app-sidebar';

/**
 * Protected layout. Wraps all signed-in pages (dashboard, investments, etc.).
 * Middleware also enforces auth, but this is a defense-in-depth check.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
