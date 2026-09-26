import { InjectionToken } from '@angular/core';

/** Current time in ms; injected so token-expiry logic can be tested without fake timers. */
export const NOW = new InjectionToken<() => number>('NOW', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});
