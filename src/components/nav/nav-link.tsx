'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Props = {
  href: string;
  label: string;
  children: React.ReactNode;
};

/**
 * Sidebar link with active-state styling. Active = pathname is the link
 * itself OR a sub-route under it (so /transactions/abc still highlights
 * Transactions). Active state uses --accent for a deliberate, persistent
 * tint vs. a transient hover wash.
 *
 * Icons are passed as children — Lucide icons are forwardRef components
 * (functions) and Next 14 refuses to serialize them across the
 * server→client boundary. The server component pre-renders <Icon /> and
 * the resulting React element crosses cleanly.
 */
export function NavLink({ href, label, children }: Props) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-card text-sm transition-colors duration-fast ease-out-quart',
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
