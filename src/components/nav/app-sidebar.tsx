import {
  Activity,
  LayoutDashboard,
  LineChart,
  Repeat,
  Sparkles,
  TrendingUp,
  Receipt,
  Target,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { auth } from '@/auth';
import { SignOutButton } from './sign-out-button';

const navGroups = [
  {
    label: 'Today',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/insights', label: 'Insights', icon: Sparkles },
      { href: '/drift', label: 'Drift', icon: Activity },
    ],
  },
  {
    label: 'Plan',
    items: [
      { href: '/goals', label: 'Goals', icon: Target },
      { href: '/recurring', label: 'Recurring', icon: Repeat },
      { href: '/simulator', label: 'Simulator', icon: LineChart },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/transactions', label: 'Transactions', icon: Receipt },
      { href: '/investments', label: 'Investments', icon: TrendingUp },
    ],
  },
] as const;

export async function AppSidebar() {
  const session = await auth();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="px-6 py-5 border-b border-border">
        <Link href="/dashboard" className="block text-base font-semibold tracking-tight">
          Foothold
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-2 border-t border-border">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        {session?.user?.email && (
          <div className="px-3 py-1">
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </div>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}
