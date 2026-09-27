import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ChangeControlSettings,
  ChangeRequest,
  ChangeRequestPage,
  CreateChangeRequestRequest,
  DecisionRequest,
  ListChangeRequestsQuery,
  UpdateChangeControlSettingsRequest,
  UpdateChangeRequestRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams } from './http-params';

/**
 * Change requests, their approval chain and the approval inbox (contract tag "ChangeRequests").
 * The chain is built by the API at submission; the last approval applies the change to the
 * budget, target end date, charter and schedule baseline. Form writes are silent; lifecycle
 * buttons (submit, withdraw, implement, revise) let the interceptor toast refusals.
 */
@Injectable({ providedIn: 'root' })
export class ChangeRequestsApi {
  private readonly http = inject(HttpClient);

  list(projectId: string, query: ListChangeRequestsQuery = {}): Observable<ChangeRequestPage> {
    return this.http.get<ChangeRequestPage>(`${this.project(projectId)}/change-requests`, {
      params: toHttpParams(query),
    });
  }

  create(projectId: string, body: CreateChangeRequestRequest): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.project(projectId)}/change-requests`, body, {
      context: silent(),
    });
  }

  get(requestId: string): Observable<ChangeRequest> {
    return this.http.get<ChangeRequest>(this.url(requestId));
  }

  /** Drafts only (409 `change_requests.not_draft`). */
  update(
    requestId: string,
    body: UpdateChangeRequestRequest,
    version: number,
  ): Observable<ChangeRequest> {
    return this.http.patch<ChangeRequest>(this.url(requestId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  submit(requestId: string): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.url(requestId)}/submit`, null);
  }

  /** The current step's approver only; a rejection needs a comment. */
  decide(requestId: string, body: DecisionRequest): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.url(requestId)}/decisions`, body, {
      context: silent(),
    });
  }

  withdraw(requestId: string): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.url(requestId)}/withdraw`, null);
  }

  implement(requestId: string): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.url(requestId)}/implement`, null);
  }

  /** A new draft revision of a rejected request (same key, next revision). */
  revise(requestId: string): Observable<ChangeRequest> {
    return this.http.post<ChangeRequest>(`${this.url(requestId)}/revise`, null);
  }

  /** Requests waiting for my decision, across the organization, oldest submission first. */
  pending(): Observable<ChangeRequest[]> {
    return this.http.get<ChangeRequest[]>(`${API_BASE}/approvals/pending`);
  }

  settings(): Observable<ChangeControlSettings> {
    return this.http.get<ChangeControlSettings>(`${API_BASE}/organization/change-control`);
  }

  /** ORG_ADMIN; `version` 0 is the defaults, never saved. */
  updateSettings(
    body: UpdateChangeControlSettingsRequest,
    version: number,
  ): Observable<ChangeControlSettings> {
    return this.http.put<ChangeControlSettings>(`${API_BASE}/organization/change-control`, body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  private url(requestId: string): string {
    return `${API_BASE}/change-requests/${encodeURIComponent(requestId)}`;
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
