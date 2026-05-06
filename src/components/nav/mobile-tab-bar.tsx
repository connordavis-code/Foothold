'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeftRight,
  CircleEllipsis,
  LayoutDashboard,
  Repeat,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';
import { navGroups, settingsItem } from './nav-routes';

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
};

// The four primary surfaces for the "where am I standing today" loop.
// The fifth slot is a More trigger that opens a bottom-drawer with the
// long-tail (Insights, Drift, Goals, Simulator, Settings). Replaces the
// top-bar hamburger that shipped in Phase 1 — single canonical path
// to long-tail nav, matching iOS Mail / Music / Phone idiom.
// Decided 2026-05-06 alongside Phase 2 mobile UAT.
const PRIMARY_TABS: readonly Tab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/recurring', label: 'Recurring', icon: Repeat },
  { href: '/investments', label: 'Invest', icon: TrendingUp },
  { href: '/transactions', label: 'Activity', icon: ArrowLeftRight },
] as const;

// Active state matches a tab when pathname is exactly the tab href OR a
// sub-route under it (so /transactions/abc still highlights Activity).
function isActiveTab(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Long-tail items for the More drawer: every nav-routes item NOT in
// PRIMARY_TABS. Computed instead of hardcoded so adding a route to
// nav-routes propagates automatically — single source of truth.
const PRIMARY_HREFS = new Set(PRIMARY_TABS.map((t) => t.href));
const LONG_TAIL_GROUPS = navGroups
  .map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !PRIMARY_HREFS.has(item.href)),
  }))
  .filter((group) => group.items.length > 0);

/**
 * Bottom-anchored 5-tab bar for the mobile shell. Hidden at md+ where
 * the desktop sidebar takes over. Each slot is a 20vw × 56px tap
 * target, well above the 44px touch floor.
 *
 * Slot 5 ("More") is a vaul Drawer trigger rather than a Link — opens
 * a bottom sheet with the long-tail grouped by nav-routes sections.
 * Active state on More fires when the current route is in the long-
 * tail set (Insights, Drift, Goals, Simulator, Settings).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isLongTailRoute = LONG_TAIL_GROUPS.some((group) =>
    group.items.some((item) => isActiveTab(pathname, item.href)),
  ) || isActiveTab(pathname, settingsItem.href);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface-elevated/95 backdrop-blur supports-[backdrop-filter]:bg-surface-elevated/80',
        'pb-[env(safe-area-inset-bottom)]',
        'md:hidden',
      )}
    >
      {PRIMARY_TABS.map((tab) => {
        const active = isActiveTab(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-fast ease-out-quart',
              active
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.6} />
            <span className="text-[10px] font-medium tracking-wide">
              {tab.label}
            </span>
            {active ? (
              <span
                aria-hidden
                className="absolute bottom-1.5 h-1 w-1 rounded-pill bg-foreground"
              />
            ) : null}
          </Link>
        );
      })}

      <MoreTab
        active={isLongTailRoute}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        pathname={pathname}
      />
    </nav>
  );
}

function MoreTab({
  active,
  open,
  onOpenChange,
  pathname,
}: {
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger asChild>
        <button
          type="button"
          aria-label="More"
          aria-expanded={open}
          className={cn(
            'relative flex h-14 flex-col items-center justify-center gap-0.5 transition-colors duration-fast ease-out-quart',
            active || open
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <CircleEllipsis
            className="h-[18px] w-[18px]"
            strokeWidth={active || open ? 2 : 1.6}
          />
          <span className="text-[10px] font-medium tracking-wide">More</span>
          {active ? (
            <span
              aria-hidden
              className="absolute bottom-1.5 h-1 w-1 rounded-pill bg-foreground"
            />
          ) : null}
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col',
            'rounded-t-card border-t border-border bg-surface-elevated',
            'pb-[env(safe-area-inset-bottom)]',
            'outline-none',
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted"
          />
          <Drawer.Title className="px-5 pt-3 pb-1 text-eyebrow">
            More
          </Drawer.Title>

          <div className="flex flex-col gap-4 overflow-y-auto px-3 pb-4 pt-2">
            {LONG_TAIL_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <DrawerLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={isActiveTab(pathname, item.href)}
                      onSelect={() => onOpenChange(false)}
                    >
                      <item.icon className="h-4 w-4" />
                    </DrawerLink>
                  ))}
                </div>
              </div>
            ))}

            <div className="border-t border-border pt-3">
              <DrawerLink
                href={settingsItem.href}
                label={settingsItem.label}
                active={isActiveTab(pathname, settingsItem.href)}
                onSelect={() => onOpenChange(false)}
              >
                <settingsItem.icon className="h-4 w-4" />
              </DrawerLink>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DrawerLink({
  href,
  label,
  active,
  onSelect,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors duration-fast ease-out-quart',
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      {children}
      {label}
    </Link>
  );
}
