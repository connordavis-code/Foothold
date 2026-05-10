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
 * Transactions).
 *
 * R.1 T6 restyle: active state replaced an accent-tint background with a
 * pulsing green dot at the left edge (single-hue restraint per DESIGN.md
 * "Mono-numeral, restrained accent floor"). Hover state indents 2px and
 * scales the icon 1.05× as a quiet honest-affordance signal. Both the
 * dot pulse keyframe and the hover transitions live in globals.css under
 * .sb-item / .sb-item-active.
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
        'sb-item relative flex items-center gap-3 rounded-[var(--r-btn)] px-3 py-2 text-[13px] transition-[transform,color] duration-fast ease-out-quart',
        isActive
          ? 'sb-item-active pl-[18px] font-medium text-[color:var(--text)]'
          : 'text-[color:var(--text-2)] hover:translate-x-[2px] hover:text-[color:var(--text)]',
      )}
    >
      {children}
      {label}
    </Link>
  );
}
