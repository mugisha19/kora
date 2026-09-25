import {
  EnvironmentProviders,
  Provider,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { TitleStrategy } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { LOCALES } from '../api/api.models';
import { LanguageService } from './language.service';
import { TranslatedTitleStrategy } from './translated-title.strategy';
import { TranslocoHttpLoader } from './transloco-http.loader';

/** Transloco with runtime language switching, translated page titles and start-up language choice. */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [...LOCALES],
        defaultLang: 'en',
        fallbackLang: 'en',
        // A missing fr/rw key shows English rather than a raw key (the parity test should prevent it).
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
    provideAppInitializer(() => inject(LanguageService).init()),
  ];
}
