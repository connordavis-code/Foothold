import { NavLink } from './nav-link';
import { navGroups, settingsItem } from './nav-routes';
import { SidebarBrand } from './sidebar-brand';

/**
 * Vertical sidebar — server component, renders the static link tree.
 * Active-state highlighting is handled per-link by <NavLink> (client).
 * Brand cluster is <SidebarBrand> (client) — needed for the click-pulse
 * animation on the mark. Both client islands keep the rest of the
 * sidebar tree out of the JS bundle.
 *
 * Icons are rendered here (server) and passed to NavLink as children;
 * passing the Lucide icon function as a prop trips Next 14's
 * server→client serialization.
 *
 * Sign-out + email used to live here. Both lifted to the top-bar user
 * menu in Phase 6.1, freeing the bottom of the sidebar.
 *
 * R.1 T6 restyle: brand mount, group labels with hairlines above
 * (.sb-group + .sb-group selector), active-state pulsing green dot via
 * .sb-item-active::before. CSS lives in globals.css @layer components.
 */
export function AppSidebar() {
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--hairline)] bg-[color:var(--surface)]">
      <SidebarBrand />

      <nav
        className="flex-1 px-3 py-4 overflow-y-auto"
        aria-label="Primary"
      >
        {navGroups.map((group) => (
          <div key={group.label} className="sb-group">
            <div className="sb-group-label">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label}>
                  <item.icon className="h-4 w-4" />
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--hairline)] px-3 py-3">
        <NavLink href={settingsItem.href} label={settingsItem.label}>
          <settingsItem.icon className="h-4 w-4" />
        </NavLink>
      </div>
    </aside>
  );
}
