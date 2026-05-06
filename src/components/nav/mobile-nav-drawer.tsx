'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Drawer } from 'vaul';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { navGroups, settingsItem } from './nav-routes';

/**
 * Mobile nav drawer + hamburger trigger. Hidden at md+ where the desktop
 * sidebar takes over. Slides in from the left at 18rem (w-72) wide,
 * carrying the same Today / Plan / Records groups + Settings as the
 * sidebar, sourced from the single nav-routes.ts truth table.
 *
 * Tapping a route navigates and closes the drawer in the same gesture
 * (Drawer.Close + Next Link composed). vaul itself handles backdrop tap,
 * swipe-left, and Escape dismissal.
 */
export function MobileNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root
      direction="left"
      open={open}
      onOpenChange={setOpen}
      shouldScaleBackground={false}
    >
      <Drawer.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-pill hover:bg-accent/60 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]" />
        <Drawer.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col',
            'border-r border-border bg-surface-elevated',
            'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
            'outline-none',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <Drawer.Title asChild>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="text-base font-semibold tracking-tight"
              >
                Foothold
              </Link>
            </Drawer.Title>
          </div>

          <nav
            aria-label="Primary"
            className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
          >
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <DrawerNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      isActive={
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)
                      }
                      onSelect={() => setOpen(false)}
                    >
                      <item.icon className="h-4 w-4" />
                    </DrawerNavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-border px-3 py-3">
            <DrawerNavLink
              href={settingsItem.href}
              label={settingsItem.label}
              isActive={
                pathname === settingsItem.href ||
                pathname.startsWith(`${settingsItem.href}/`)
              }
              onSelect={() => setOpen(false)}
            >
              <settingsItem.icon className="h-4 w-4" />
            </DrawerNavLink>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

type DrawerNavLinkProps = {
  href: string;
  label: string;
  isActive: boolean;
  onSelect: () => void;
  children: React.ReactNode;
};

function DrawerNavLink({
  href,
  label,
  isActive,
  onSelect,
  children,
}: DrawerNavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex min-h-[44px] items-center gap-3 rounded-card px-3 py-2 text-sm transition-colors duration-fast ease-out-quart',
        isActive
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
      )}
    >
      {children}
      {label}
    </Link>
  );
}
