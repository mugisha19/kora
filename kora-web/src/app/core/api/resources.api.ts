import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Allocation,
  AllocationInput,
  Capacity,
  CreateLeaveRequest,
  Leave,
  ResourceHeatmap,
  UpdateCapacityRequest,
  WorkingCalendar,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * Capacity, allocations, leave and the resource heat map (contract tag "Resources"). Weeks start
 * on Monday; the heat map covers at most 26 weeks.
 */
@Injectable({ providedIn: 'root' })
export class ResourcesApi {
  private readonly http = inject(HttpClient);

  heatmap(
    query: { from?: string; to?: string; projectId?: string } = {},
  ): Observable<ResourceHeatmap> {
    return this.http.get<ResourceHeatmap>(`${API_BASE}/resources/heatmap`, {
      params: toHttpParams(query),
    });
  }

  allocations(
    projectId: string,
    query: { from?: string; to?: string } = {},
  ): Observable<Allocation[]> {
    return this.http.get<Allocation[]>(`${this.project(projectId)}/allocations`, {
      params: toHttpParams(query),
    });
  }

  /** Hours 0 removes an allocation; returns every allocation of the project. */
  saveAllocations(projectId: string, allocations: AllocationInput[]): Observable<Allocation[]> {
    return this.http.put<Allocation[]>(
      `${this.project(projectId)}/allocations`,
      { allocations },
      { context: silent() },
    );
  }

  capacity(userId: string): Observable<Capacity> {
    return this.http.get<Capacity>(`${this.user(userId)}/capacity`);
  }

  changeCapacity(userId: string, body: UpdateCapacityRequest): Observable<Capacity> {
    return this.http.put<Capacity>(`${this.user(userId)}/capacity`, body, { context: silent() });
  }

  addLeave(userId: string, body: CreateLeaveRequest): Observable<Leave> {
    return this.http.post<Leave>(`${this.user(userId)}/leave`, body, { context: silent() });
  }

  cancelLeave(leaveId: string): Observable<void> {
    return this.http.delete(`${API_BASE}/leave/${encodeURIComponent(leaveId)}`).pipe(toVoid);
  }

  /** ORG_ADMIN; adds a country's public holidays for a year to the working calendar. */
  addPublicHolidays(year: number, version: number): Observable<WorkingCalendar> {
    return this.http.post<WorkingCalendar>(
      `${API_BASE}/organization/calendar/public-holidays`,
      { country: 'RW', year },
      { headers: { 'If-Match': ifMatch(version) }, context: silent() },
    );
  }

  private user(userId: string): string {
    return `${API_BASE}/users/${encodeURIComponent(userId)}`;
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
