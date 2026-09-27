import { Role } from '../api/api.models';

export interface NavItem {
  /** Router path. */
  readonly path: string;
  /** Translation key of the label. */
  readonly label: string;
  /** Icon name in `public/icons`. */
  readonly icon: string;
  /** Roles that see the item; omitted means everyone. The route has a matching guard. */
  readonly roles?: readonly Role[];
}

/** Primary navigation. Later phases add timesheets and resources. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' },
  { path: '/portfolios', label: 'nav.portfolios', icon: 'folder_open' },
  { path: '/projects', label: 'nav.projects', icon: 'assignment' },
  { path: '/admin', label: 'nav.admin', icon: 'admin_panel_settings', roles: ['ORG_ADMIN'] },
  { path: '/settings', label: 'nav.settings', icon: 'settings' },
];

export function visibleNavItems(role: Role | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}
