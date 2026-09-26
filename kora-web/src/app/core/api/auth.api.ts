import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ForgotPasswordRequest,
  LoginRequest,
  RegisterOrganizationRequest,
  ResetPasswordRequest,
  SessionResponse,
} from './api.models';
import { SKIP_LOADING, authFlow, silent } from './http-context';
import { API_BASE, toVoid } from './http-params';

/**
 * Auth operations (contract tag "Auth"). All of them are part of the auth flow: the auth interceptor
 * never attaches a bearer token or tries a refresh for them. They are also silent: the sign-in pages
 * show every error inline, so the global toast would only repeat it. The refresh token itself travels only
 * in the HttpOnly `kora_refresh` cookie, which the browser sends because the API is same-origin.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${API_BASE}/auth/login`, body, {
      context: silent(authFlow()),
    });
  }

  /** Silent: a failed refresh means "signed out", which the session layer reports itself. */
  refresh(): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${API_BASE}/auth/refresh`, null, {
      context: silent(authFlow()).set(SKIP_LOADING, true),
    });
  }

  logout(): Observable<void> {
    return this.http
      .post(`${API_BASE}/auth/logout`, null, { context: silent(authFlow()) })
      .pipe(toVoid);
  }

  registerOrganization(body: RegisterOrganizationRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${API_BASE}/auth/register-organization`, body, {
      context: silent(authFlow()),
    });
  }

  forgotPassword(body: ForgotPasswordRequest): Observable<void> {
    return this.http
      .post(`${API_BASE}/auth/password/forgot`, body, { context: silent(authFlow()) })
      .pipe(toVoid);
  }

  resetPassword(body: ResetPasswordRequest): Observable<void> {
    return this.http
      .post(`${API_BASE}/auth/password/reset`, body, { context: silent(authFlow()) })
      .pipe(toVoid);
  }
}
