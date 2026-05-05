'use client';

import { usePathname } from 'next/navigation';
import { findNavItem } from './nav-routes';

/**
 * Resolves the current top-bar title from pathname. Pulled to a client
 * component so the parent layout (which runs on every navigation) doesn't
 * have to thread route state down. The route → label map lives in
 * `nav-routes.ts` so sidebar and title stay in lockstep.
 */
export function PageTitle() {
  const pathname = usePathname();
  const item = findNavItem(pathname);
  return (
    <h1 className="text-sm font-medium tracking-tight text-foreground">
      {item?.label ?? 'Foothold'}
    </h1>
  );
}
