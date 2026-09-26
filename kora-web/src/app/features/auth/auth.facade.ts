import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LoginRequest, RegisterOrganizationRequest } from '../../core/api/api.models';
import { AuthApi } from '../../core/api/auth.api';
import { SessionFacade } from '../../core/session/session.facade';

/**
 * What the public auth pages can do. Each call resolves when done (and, for sign-in and
 * registration, after navigating into the app) or rejects with an `ApiError` the page displays.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionFacade);

  async signIn(credentials: LoginRequest, returnUrl: string | null): Promise<void> {
    const session = await firstValueFrom(this.api.login(credentials));
    await this.session.begin(session, { returnUrl });
  }

  async registerOrganization(request: RegisterOrganizationRequest): Promise<void> {
    const session = await firstValueFrom(this.api.registerOrganization(request));
    await this.session.begin(session);
  }

  forgotPassword(email: string): Promise<void> {
    return firstValueFrom(this.api.forgotPassword({ email }));
  }

  resetPassword(token: string, newPassword: string): Promise<void> {
    return firstValueFrom(this.api.resetPassword({ token, newPassword }));
  }
}
