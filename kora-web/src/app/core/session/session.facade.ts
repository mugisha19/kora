import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { SessionResponse } from '../api/api.models';
import { AuthApi } from '../api/auth.api';
import { MeApi } from '../api/me.api';
import { safeReturnUrl } from '../auth/safe-return-url';
import { LanguageService } from '../i18n/language.service';
import { SessionRefresher } from './session-refresher';
import { SessionStore } from './session.store';

/** How long start-up waits for the silent refresh before showing the app signed out. */
export const RESTORE_TIMEOUT_MS = 5000;

/**
 * The session's lifecycle for the rest of the app: begin (after login, register or accepting an
 * invitation), restore on reload, switch organization, expire, sign out. Components call this, never
 * the store or the auth API directly.
 */
@Injectable({ providedIn: 'root' })
export class SessionFacade {
  private readonly store = inject(SessionStore);
  private readonly authApi = inject(AuthApi);
  private readonly meApi = inject(MeApi);
  private readonly refresher = inject(SessionRefresher);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly announcer = inject(LiveAnnouncer);

  /** Starts a session and goes to the (validated) return URL. */
  begin(
    session: SessionResponse,
    options: { returnUrl?: string | null; organizationId?: string } = {},
  ): Promise<boolean> {
    this.store.start(session);
    if (options.organizationId) this.store.switchOrganization(options.organizationId);
    this.language.useProfileLocale(session.user.locale);
    return this.router.navigateByUrl(safeReturnUrl(options.returnUrl));
  }

  /**
   * One silent refresh at start-up: the HttpOnly cookie survives reloads, the in-memory token
   * doesn't. Resolves either way; a failure just means "signed out".
   */
  async restore(): Promise<void> {
    try {
      const session = await firstValueFrom(
        this.refresher.refresh().pipe(timeout(RESTORE_TIMEOUT_MS)),
      );
      this.language.useProfileLocale(session.user.locale);
    } catch {
      // No valid refresh cookie, API unreachable or too slow: start signed out.
    }
  }

  switchOrganization(organizationId: string): Promise<boolean> {
    if (!this.store.switchOrganization(organizationId)) return Promise.resolve(false);
    const name = this.store.activeMembership()?.organizationName ?? '';
    void this.announcer.announce(
      this.transloco.translate('orgSwitcher.switched', { name }),
      'polite',
    );
    return this.router.navigateByUrl('/dashboard');
  }

  /** Re-reads `/me` after a change that affects it (profile, organization name, membership). */
  async refreshUser(): Promise<void> {
    this.store.setUser(await firstValueFrom(this.meApi.get()));
  }

  /** The refresh token was rejected mid-session: back to sign-in, then back here. */
  expire(): Promise<boolean> {
    this.store.clear();
    return this.router.navigate(['/login'], {
      queryParams: { returnUrl: this.router.url, reason: 'expired' },
    });
  }

  /** Revokes the session on the server (best effort) and forgets it here. */
  async signOut(): Promise<boolean> {
    await firstValueFrom(this.authApi.logout().pipe(catchError(() => of(undefined))));
    this.store.clear();
    return this.router.navigateByUrl('/login');
  }
}
