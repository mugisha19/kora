import { EnvironmentProviders, Provider, importProvidersFrom } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { FakeMatIconRegistry } from '@angular/material/icon/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../public/i18n/en.json';
import fr from '../../public/i18n/fr.json';
import rw from '../../public/i18n/rw.json';
import { LOCALES } from '../app/core/api/api.models';
import { LIVE_TRANSPORT } from '../app/core/live/live-transport';
import { MockBrokerTransport } from '../app/core/live/mock-broker-transport';

/**
 * Real translation files, loaded synchronously, so tests assert on the text users actually see
 * (and fail if a key is missing).
 */
export function provideTestI18n(): EnvironmentProviders {
  return importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { en, fr, rw },
      translocoConfig: {
        availableLangs: [...LOCALES],
        defaultLang: 'en',
        reRenderOnLangChange: true,
      },
      preloadLangs: true,
    }),
  );
}

/** `<mat-icon svgIcon>` without HTTP: icons render as empty SVGs. */
export function provideTestIcons(): Provider {
  return { provide: MatIconRegistry, useClass: FakeMatIconRegistry };
}

/**
 * jsdom never fires `transitionend`, so animated Material components (drawer, dialog, menu) would
 * settle on fallback timers and make tests timing-dependent. Tests run with animations off.
 */
export function provideNoAnimations(): Provider {
  return { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } };
}

/**
 * Live updates from the mock API's in-page broker, never a real WebSocket (offline when a test
 * doesn't load the mock API).
 */
export function provideTestLive(): Provider {
  return { provide: LIVE_TRANSPORT, useClass: MockBrokerTransport };
}

export function provideTestUi(): (Provider | EnvironmentProviders)[] {
  return [provideTestI18n(), provideTestIcons(), provideNoAnimations(), provideTestLive()];
}
