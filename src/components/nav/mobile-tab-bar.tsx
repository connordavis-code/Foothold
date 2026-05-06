'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight,
  LayoutDashboard,
  Repeat,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// The four primary surfaces for the "where am I standing today" loop.
// Drawer (/insights, /drift, /goals, /simulator, /settings) carries the
// long-tail. Decided 2026-05-06 in mobile-first responsive design brief.
const TABS: readonly Tab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/recurring', label: 'Recurring', icon: Repeat },
  { href: '/investments', label: 'Invest', icon: TrendingUp },
  { href: '/transactions', label: 'Activity', icon: ArrowLeftRight },
] as const;

/**
 * Bottom-anchored tab bar for the mobile shell. Hidden at md+ where the
 * desktop sidebar takes over. Each slot is a full 25vw × 56px tap target,
 * well above the 44px touch floor.
 *
 * Active state matches a tab when pathname is exactly the tab href OR a
 * sub-route under it (so /transactions/abc still highlights Activity).
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface-elevated/95 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/80',
        'pb-[env(safe-area-inset-bottom)]',
        'md:hidden',
      )}
    >
      {TABS.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-fast ease-out-quart',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2 : 1.6} />
            <span className="text-[10px] font-medium tracking-wide">
              {tab.label}
            </span>
            {isActive ? (
              <span
                aria-hidden
                className="absolute bottom-1.5 h-1 w-1 rounded-pill bg-foreground"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
