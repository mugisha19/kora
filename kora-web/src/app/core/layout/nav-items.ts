export interface NavItem {
  /** Router path. */
  readonly path: string;
  /** Translation key of the label. */
  readonly label: string;
  /** Icon name in `public/icons`. */
  readonly icon: string;
}

/** Primary navigation. Later phases add projects, timesheets, resources and (by role) admin. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', label: 'nav.dashboard', icon: 'dashboard' },
  { path: '/settings', label: 'nav.settings', icon: 'settings' },
];
