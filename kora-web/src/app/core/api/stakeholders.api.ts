import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateStakeholderRequest,
  ListStakeholdersQuery,
  Stakeholder,
  StakeholderGrid,
  StakeholderPage,
  UpdateStakeholderRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * The stakeholder register and power/interest grid (contract tag "Stakeholders"). Removing a
 * stakeholder anonymizes the record (personal data erased); removed ones leave the list and grid.
 */
@Injectable({ providedIn: 'root' })
export class StakeholdersApi {
  private readonly http = inject(HttpClient);

  list(projectId: string, query: ListStakeholdersQuery = {}): Observable<StakeholderPage> {
    return this.http.get<StakeholderPage>(`${this.project(projectId)}/stakeholders`, {
      params: toHttpParams(query),
    });
  }

  /** Always four quadrants: MANAGE_CLOSELY, KEEP_SATISFIED, KEEP_INFORMED, MONITOR. */
  grid(projectId: string): Observable<StakeholderGrid> {
    return this.http.get<StakeholderGrid>(`${this.project(projectId)}/stakeholders/grid`);
  }

  create(projectId: string, body: CreateStakeholderRequest): Observable<Stakeholder> {
    return this.http.post<Stakeholder>(`${this.project(projectId)}/stakeholders`, body, {
      context: silent(),
    });
  }

  get(stakeholderId: string): Observable<Stakeholder> {
    return this.http.get<Stakeholder>(this.url(stakeholderId));
  }

  update(
    stakeholderId: string,
    body: UpdateStakeholderRequest,
    version: number,
  ): Observable<Stakeholder> {
    return this.http.patch<Stakeholder>(this.url(stakeholderId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  remove(stakeholderId: string): Observable<void> {
    return this.http.delete(this.url(stakeholderId)).pipe(toVoid);
  }

  private url(stakeholderId: string): string {
    return `${API_BASE}/stakeholders/${encodeURIComponent(stakeholderId)}`;
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
