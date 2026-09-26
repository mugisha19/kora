import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AcceptInvitationRequest,
  CreateInvitationRequest,
  Invitation,
  InvitationPage,
  InvitationPreview,
  ListInvitationsQuery,
  SessionResponse,
} from './api.models';
import { authFlow, silent } from './http-context';
import { API_BASE, toHttpParams, toVoid } from './http-params';

/**
 * Invitations (contract tag "Invitations"). Listing, creating and revoking are admin operations in
 * the active organization; the token preview and accept are public and run as part of the auth flow.
 */
@Injectable({ providedIn: 'root' })
export class InvitationsApi {
  private readonly http = inject(HttpClient);

  list(query: ListInvitationsQuery = {}): Observable<InvitationPage> {
    return this.http.get<InvitationPage>(`${API_BASE}/invitations`, {
      params: toHttpParams(query),
    });
  }

  create(body: CreateInvitationRequest): Observable<Invitation> {
    // Silent: the invite dialog shows errors next to its fields.
    return this.http.post<Invitation>(`${API_BASE}/invitations`, body, { context: silent() });
  }

  revoke(invitationId: string): Observable<void> {
    return this.http
      .delete(`${API_BASE}/invitations/${encodeURIComponent(invitationId)}`)
      .pipe(toVoid);
  }

  preview(token: string): Observable<InvitationPreview> {
    return this.http.get<InvitationPreview>(this.tokenUrl(token), { context: silent(authFlow()) });
  }

  accept(token: string, body: AcceptInvitationRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.tokenUrl(token)}/accept`, body, {
      context: silent(authFlow()),
    });
  }

  private tokenUrl(token: string): string {
    return `${API_BASE}/invitations/token/${encodeURIComponent(token)}`;
  }
}
