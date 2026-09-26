import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Organization, UpdateOrganizationRequest } from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch } from './http-params';

/** The active organization (contract tag "Organization"); the tenant header selects which one. */
@Injectable({ providedIn: 'root' })
export class OrganizationApi {
  private readonly http = inject(HttpClient);

  get(): Observable<Organization> {
    return this.http.get<Organization>(`${API_BASE}/organization`);
  }

  /** `version` is the one the user edited; a newer one on the server yields 412. */
  update(body: UpdateOrganizationRequest, version: number): Observable<Organization> {
    return this.http.patch<Organization>(`${API_BASE}/organization`, body, {
      headers: { 'If-Match': ifMatch(version) },
      // Silent: the settings form shows errors inline (and offers a reload on 412).
      context: silent(),
    });
  }
}
