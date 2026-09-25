import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { provideTestI18n } from '../../../testing/test-providers';
import { PREFERENCE_KEYS } from '../storage/preferences';
import { LanguageService, isLocale } from './language.service';

describe('LanguageService', () => {
  function setup(browserLanguage = 'en-US') {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue(browserLanguage);
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([browserLanguage]);
    TestBed.configureTestingModule({ providers: [provideTestI18n()] });
    return {
      language: TestBed.inject(LanguageService),
      transloco: TestBed.inject(TranslocoService),
    };
  }

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    document.documentElement.lang = 'en';
  });

  it('prefers the language chosen on this device', async () => {
    localStorage.setItem(PREFERENCE_KEYS.language, 'rw');
    const { language, transloco } = setup('fr-FR');

    await language.init();

    expect(language.current()).toBe('rw');
    expect(transloco.getActiveLang()).toBe('rw');
    expect(document.documentElement.lang).toBe('rw');
  });

  it('falls back to a supported browser language, then English', async () => {
    const { language } = setup('fr-CA');
    await language.init();
    expect(language.current()).toBe('fr');

    TestBed.resetTestingModule();
    const other = setup('de-DE');
    await other.language.init();
    expect(other.language.current()).toBe('en');
  });

  it('still starts when the language file fails to load', async () => {
    const { language, transloco } = setup();
    vi.spyOn(transloco, 'load').mockImplementation(() => {
      throw new Error('offline');
    });

    await expect(language.init()).resolves.toBeUndefined();
    expect(language.current()).toBe('en');
  });

  it('remembers a choice made on this device', () => {
    const { language } = setup();

    language.choose('fr');

    expect(language.current()).toBe('fr');
    expect(localStorage.getItem(PREFERENCE_KEYS.language)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('applies the profile locale only when this device has no choice', () => {
    const { language } = setup();

    language.useProfileLocale('rw');
    expect(language.current()).toBe('rw');

    language.choose('fr');
    language.useProfileLocale('en');
    expect(language.current()).toBe('fr');
  });

  it('recognizes supported locales', () => {
    expect(isLocale('rw')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
