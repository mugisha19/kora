import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { EnvironmentProviders, ErrorHandler, Provider } from '@angular/core';
import { GlobalErrorHandler } from '../errors/global-error-handler';
import { API_INTERCEPTORS } from './interceptors';

/** HttpClient with the Kora interceptor chain, plus the app-wide error handler. */
export function provideApi(): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withFetch(), withInterceptors(API_INTERCEPTORS)),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ];
}
