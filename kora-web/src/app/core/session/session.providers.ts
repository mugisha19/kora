import { DestroyRef, EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { SessionRefresher } from './session-refresher';
import { SessionFacade } from './session.facade';

/**
 * Before the first navigation: restore the session from the refresh cookie (so a reload keeps the
 * user signed in and guards see the right state), and send the user to sign-in whenever a session
 * later expires.
 */
export function provideSessionRestore(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const facade = inject(SessionFacade);
    const subscription = inject(SessionRefresher).expired$.subscribe(() => void facade.expire());
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    return facade.restore();
  });
}
