import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { TranslocoService, getBrowserLang } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LOCALES, Locale } from '../api/api.models';
import { PREFERENCE_KEYS, readPreference, writePreference } from '../storage/preferences';

/** Endonyms: a language is always listed in its own language, whatever the UI language is. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  rw: 'Ikinyarwanda',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly (string | null | undefined)[]).includes(value);
}

/**
 * Active UI language (feature 23). Resolution order:
 * device choice → profile locale (after sign-in) → browser language → English.
 * `<html lang>` always follows, so screen readers pronounce text correctly.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly currentSignal = signal<Locale>('en');

  readonly current = this.currentSignal.asReadonly();
  readonly available = LOCALES;

  /**
   * Applies the device choice or the browser language; called once at start-up. Resolves when that
   * language's file is loaded so the first render never shows raw keys. A failed load isn't fatal:
   * the app starts and Transloco falls back to English.
   */
  async init(): Promise<void> {
    const stored = readPreference(PREFERENCE_KEYS.language);
    const browser = getBrowserLang();
    const locale = isLocale(stored) ? stored : isLocale(browser) ? browser : 'en';
    this.apply(locale);
    try {
      await firstValueFrom(this.transloco.load(locale));
    } catch {
      // Keep starting; the missing-translation handler falls back to English.
    }
  }

  /** The user picked a language on this device: apply it and remember it here. */
  choose(locale: Locale): void {
    writePreference(PREFERENCE_KEYS.language, locale);
    this.apply(locale);
  }

  /** The signed-in user's saved locale wins over the browser, but not over a device choice. */
  useProfileLocale(locale: Locale): void {
    if (!isLocale(readPreference(PREFERENCE_KEYS.language))) {
      this.apply(locale);
    }
  }

  private apply(locale: Locale): void {
    this.currentSignal.set(locale);
    this.transloco.setActiveLang(locale);
    this.document.documentElement.lang = locale;
  }
}
