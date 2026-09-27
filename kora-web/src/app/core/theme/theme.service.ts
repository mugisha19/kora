import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../storage/preferences';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const THEME_ICONS: Record<ThemeMode, string> = {
  light: 'light_mode',
  dark: 'dark_mode',
  system: 'contrast',
};

function isThemeMode(value: string | null): value is ThemeMode {
  return (THEME_MODES as readonly (string | null)[]).includes(value);
}

/**
 * Light / dark / system theme, remembered per device (feature 23).
 *
 * The Material theme is built with `light-dark()` tokens, so switching only sets `data-theme` on
 * `<html>`; CSS maps it to `color-scheme`. "system" removes the attribute and lets the OS decide.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly modeSignal = signal<ThemeMode>(this.storedMode());

  readonly mode = this.modeSignal.asReadonly();

  private readonly systemDark = signal(this.prefersDark()?.matches ?? false);
  /** The scheme actually shown, for code that draws its own colours (charts). */
  readonly scheme = computed<'light' | 'dark'>(() => {
    const mode = this.modeSignal();
    return mode === 'system' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });

  constructor() {
    this.prefersDark()?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    effect(() => {
      const mode = this.modeSignal();
      const root = this.document.documentElement;
      if (mode === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', mode);
      }
    });
  }

  setMode(mode: ThemeMode): void {
    this.modeSignal.set(mode);
    writePreference(PREFERENCE_KEYS.theme, mode === 'system' ? null : mode);
  }

  private prefersDark(): MediaQueryList | null {
    const view = this.document.defaultView;
    return typeof view?.matchMedia === 'function'
      ? view.matchMedia('(prefers-color-scheme: dark)')
      : null;
  }

  private storedMode(): ThemeMode {
    const stored = readPreference(PREFERENCE_KEYS.theme);
    return isThemeMode(stored) ? stored : 'system';
  }
}
