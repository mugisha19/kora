// Copies the Material Symbols (Apache-2.0) icons Kora uses into public/icons so the app ships only
// the SVGs it needs and loads nothing from third-party origins (keeps the CSP strict).
// Usage: node scripts/copy-icons.mjs   (add a name to ICONS, then re-run)
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICONS = [
  'account_circle',
  'admin_panel_settings',
  'arrow_back',
  'badge',
  'block',
  'cancel',
  'check',
  'check_circle',
  'close',
  'contrast',
  'corporate_fare',
  'dark_mode',
  'dashboard',
  'delete',
  'domain',
  'error',
  'keyboard_arrow_down',
  'group',
  'info',
  'language',
  'light_mode',
  'lock',
  'lock_reset',
  'login',
  'logout',
  'mail',
  'menu',
  'more_vert',
  'person_add',
  'refresh',
  'search',
  'send',
  'settings',
  'swap_horiz',
  'translate',
  'visibility',
  'visibility_off',
  'warning',
  'wifi_off',
  'folder_open',
  'schedule',
  'palette',
  'person',
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/@material-symbols/svg-400/outlined');
const target = join(root, 'public/icons');
mkdirSync(target, { recursive: true });

for (const name of ICONS) {
  const file = join(source, `${name}.svg`);
  if (!existsSync(file)) throw new Error(`Unknown icon: ${name}`);
  copyFileSync(file, join(target, `${name}.svg`));
}
console.log(`Copied ${ICONS.length} icons to public/icons`);
