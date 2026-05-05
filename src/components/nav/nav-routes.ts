import {
  Activity,
  LayoutDashboard,
  LineChart,
  Receipt,
  Repeat,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

// Shared between the sidebar (renders the list) and the top bar
// (resolves the current page title from pathname). Keep ordering
// stable — sidebar grouping is part of the IA decision in
// `docs/superpowers/specs/2026-05-05-foothold-redesign-design.md` §3.4.
export const navGroups: readonly NavGroup[] = [
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

export const settingsItem: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
};

const allItems: readonly NavItem[] = [
  ...navGroups.flatMap((g) => g.items),
  settingsItem,
];

export function findNavItem(pathname: string): NavItem | null {
  // Exact match first, then longest-prefix (so /transactions/123 still
  // resolves to "Transactions" without inventing dynamic-segment logic).
  const exact = allItems.find((i) => i.href === pathname);
  if (exact) return exact;
  const prefix = allItems
    .filter((i) => pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return prefix ?? null;
}
