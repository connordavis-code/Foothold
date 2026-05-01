import Link from 'next/link';
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Target,
  Settings,
} from 'lucide-react';
import { auth } from '@/auth';
import { SignOutButton } from './sign-out-button';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/transactions', label: 'Transactions', icon: Receipt },
  { href: '/investments', label: 'Investments', icon: TrendingUp },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export async function AppSidebar() {
  const session = await auth();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <Link
          href="/dashboard"
          className="block text-base font-semibold tracking-tight"
        >
          Finance
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        {session?.user?.email && (
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground truncate">
              {session.user.email}
            </p>
          </div>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}
