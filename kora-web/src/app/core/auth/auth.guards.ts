import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Role } from '../api/api.models';
import { Notifier } from '../notify/notifier';
import { SessionStore } from '../session/session.store';

/*
 * Guards decide what the UI offers; the API enforces the same rules on every call. Hiding a page
 * the user can't use is a courtesy, not security (feature 03).
 */

/** Signed-in area: anonymous users go to sign-in and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionStore).isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Sign-in pages: someone already signed in goes to the dashboard instead. */
export const guestGuard: CanActivateFn = () =>
  inject(SessionStore).isAuthenticated() ? inject(Router).createUrlTree(['/dashboard']) : true;

/** Pages for some roles only, e.g. `roleGuard('ORG_ADMIN')`. Others are told why they bounced. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const role = inject(SessionStore).activeRole();
    if (role && roles.includes(role)) return true;
    inject(Notifier).info(inject(TranslocoService).translate('guards.forbidden'));
    return inject(Router).createUrlTree(['/dashboard']);
  };
}
