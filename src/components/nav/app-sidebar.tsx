import Link from 'next/link';
import { NavLink } from './nav-link';
import { navGroups, settingsItem } from './nav-routes';

/**
 * Vertical sidebar — server component, renders the static link tree.
 * Active-state highlighting is handled per-link by <NavLink> (client) so
 * we don't ship the whole sidebar to the bundle.
 *
 * Sign-out + email used to live here. Both lifted to the top-bar user
 * menu in Phase 6.1, freeing the bottom of the sidebar.
 */
export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="px-6 py-4 border-b border-border">
        <Link
          href="/dashboard"
          className="block text-base font-semibold tracking-tight"
        >
          Foothold
        </Link>
      </div>

      <nav
        className="flex-1 px-3 py-4 space-y-5 overflow-y-auto"
        aria-label="Primary"
      >
        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <NavLink item={settingsItem} />
      </div>
    </aside>
  );
}
