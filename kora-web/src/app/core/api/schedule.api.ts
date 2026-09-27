import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Baseline,
  CreateDependencyRequest,
  Dependency,
  Schedule,
  UpdateWorkingCalendarRequest,
  WorkingCalendar,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toVoid } from './http-params';

/**
 * Dependencies, the critical-path schedule, baselines and the working calendar (contract tag
 * "Schedule"). Dependencies and baselines are for Predictive and Hybrid projects (409
 * `schedule.not_predictive`). Creating a dependency is silent: the form shows a loop as the chain
 * of task keys that would close it.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleApi {
  private readonly http = inject(HttpClient);

  dependencies(projectId: string): Observable<Dependency[]> {
    return this.http.get<Dependency[]>(`${this.project(projectId)}/dependencies`);
  }

  addDependency(projectId: string, body: CreateDependencyRequest): Observable<Dependency> {
    return this.http.post<Dependency>(`${this.project(projectId)}/dependencies`, body, {
      context: silent(),
    });
  }

  removeDependency(dependencyId: string): Observable<void> {
    return this.http
      .delete(`${API_BASE}/dependencies/${encodeURIComponent(dependencyId)}`)
      .pipe(toVoid);
  }

  /** Computed on every call (CPM on the organization's working calendar). */
  schedule(projectId: string): Observable<Schedule> {
    return this.http.get<Schedule>(`${this.project(projectId)}/schedule`);
  }

  /** Records every task's early dates as the new baseline. */
  saveBaseline(projectId: string): Observable<Baseline> {
    return this.http.post<Baseline>(`${this.project(projectId)}/schedule/baseline`, null);
  }

  calendar(): Observable<WorkingCalendar> {
    return this.http.get<WorkingCalendar>(`${API_BASE}/organization/calendar`);
  }

  /** ORG_ADMIN; `version` 0 is the default calendar that was never saved. */
  updateCalendar(body: UpdateWorkingCalendarRequest, version: number): Observable<WorkingCalendar> {
    return this.http.put<WorkingCalendar>(`${API_BASE}/organization/calendar`, body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
