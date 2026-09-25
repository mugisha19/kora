import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideI18n } from './core/i18n/i18n.providers';
import { provideIcons } from './core/icons/icons.providers';

/** Users who ask the OS for reduced motion get Material without animations (WCAG 2.3.3). */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideI18n(),
    provideIcons(),
    {
      provide: MATERIAL_ANIMATIONS,
      useFactory: () => ({ animationsDisabled: prefersReducedMotion() }),
    },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
  ],
};
