import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateIssueRequest,
  Issue,
  IssuePage,
  ListIssuesQuery,
  UpdateIssueRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams } from './http-params';

/**
 * The issue log (contract tag "Issues"). PATCH moves between OPEN and IN_PROGRESS only;
 * resolving, closing and reopening have their own operations. Form writes are silent.
 */
@Injectable({ providedIn: 'root' })
export class IssuesApi {
  private readonly http = inject(HttpClient);

  list(projectId: string, query: ListIssuesQuery = {}): Observable<IssuePage> {
    return this.http.get<IssuePage>(`${this.project(projectId)}/issues`, {
      params: toHttpParams(query),
    });
  }

  create(projectId: string, body: CreateIssueRequest): Observable<Issue> {
    return this.http.post<Issue>(`${this.project(projectId)}/issues`, body, {
      context: silent(),
    });
  }

  get(issueId: string): Observable<Issue> {
    return this.http.get<Issue>(this.url(issueId));
  }

  update(issueId: string, body: UpdateIssueRequest, version: number): Observable<Issue> {
    return this.http.patch<Issue>(this.url(issueId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  resolve(issueId: string, resolution: string): Observable<Issue> {
    return this.http.post<Issue>(
      `${this.url(issueId)}/resolve`,
      { resolution },
      { context: silent() },
    );
  }

  /** Managers; only a resolved issue closes. */
  close(issueId: string): Observable<Issue> {
    return this.http.post<Issue>(`${this.url(issueId)}/close`, null);
  }

  reopen(issueId: string, reason: string): Observable<Issue> {
    return this.http.post<Issue>(`${this.url(issueId)}/reopen`, { reason }, { context: silent() });
  }

  private url(issueId: string): string {
    return `${API_BASE}/issues/${encodeURIComponent(issueId)}`;
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
