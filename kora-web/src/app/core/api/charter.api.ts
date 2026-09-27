import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Charter, CharterContent } from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch } from './http-params';

/**
 * A project's charter and its approval workflow (contract tag "Charter"). The charter page shows
 * every error inline (incomplete fields, not a draft…), so all writes are silent in the toast.
 */
@Injectable({ providedIn: 'root' })
export class CharterApi {
  private readonly http = inject(HttpClient);

  get(projectId: string): Observable<Charter> {
    return this.http.get<Charter>(this.url(projectId));
  }

  /** Replaces the whole draft; lists replace the stored ones entirely. */
  replace(projectId: string, content: CharterContent, version: number): Observable<Charter> {
    return this.http.put<Charter>(this.url(projectId), content, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  submit(projectId: string): Observable<Charter> {
    return this.http.post<Charter>(`${this.url(projectId)}/submit`, null, { context: silent() });
  }

  approve(projectId: string): Observable<Charter> {
    return this.http.post<Charter>(`${this.url(projectId)}/approve`, null, { context: silent() });
  }

  returnToDraft(projectId: string, comment: string): Observable<Charter> {
    return this.http.post<Charter>(
      `${this.url(projectId)}/return`,
      { comment },
      { context: silent() },
    );
  }

  /** Every version, newest first. */
  versions(projectId: string): Observable<Charter[]> {
    return this.http.get<Charter[]>(`${this.url(projectId)}/versions`);
  }

  private url(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}/charter`;
  }
}
