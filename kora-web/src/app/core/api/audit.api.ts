import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivityPage,
  AuditEvent,
  AuditPage,
  AuditVerification,
  ListAuditEventsQuery,
} from './api.models';
import { API_BASE, toHttpParams } from './http-params';

/**
 * What happened (contract tags "Activity" and "Audit"): a project's activity feed, an item's
 * history, and the organization's audit trail with its hash-chain check (administrators only).
 * Lists are cursor-paged: follow `nextCursor` until it is absent.
 */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  /** Newest first. */
  activity(projectId: string, cursor?: string, limit?: number): Observable<ActivityPage> {
    return this.http.get<ActivityPage>(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/activity`,
      { params: toHttpParams({ cursor, limit }) },
    );
  }

  /** Oldest first; `entityType` as in audit events (task, risk, change-request, project…). */
  history(entityType: string, entityId: string): Observable<AuditEvent[]> {
    return this.http.get<AuditEvent[]>(
      `${API_BASE}/history/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    );
  }

  /** Newest first. */
  list(query: ListAuditEventsQuery = {}): Observable<AuditPage> {
    return this.http.get<AuditPage>(`${API_BASE}/audit`, { params: toHttpParams(query) });
  }

  verify(from?: string, to?: string): Observable<AuditVerification> {
    return this.http.get<AuditVerification>(`${API_BASE}/audit/verify`, {
      params: toHttpParams({ from, to }),
    });
  }
}
