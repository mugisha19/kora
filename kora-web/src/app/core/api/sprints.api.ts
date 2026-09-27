import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BacklogQuery,
  Burndown,
  CreateSprintRequest,
  Sprint,
  TaskPage,
  UpdateSprintRequest,
  Velocity,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * Backlog, sprints, burndown and velocity (contract tag "Sprints"). Agile and Hybrid projects only
 * (409 `sprints.not_agile`). Commands from dialogs are silent; the dialog shows the error.
 */
@Injectable({ providedIn: 'root' })
export class SprintsApi {
  private readonly http = inject(HttpClient);

  /** Unfinished tasks in no sprint, in rank order. */
  backlog(projectId: string, query: BacklogQuery = {}): Observable<TaskPage> {
    return this.http.get<TaskPage>(`${this.project(projectId)}/backlog`, {
      params: toHttpParams(query),
    });
  }

  /** Newest first. */
  list(projectId: string): Observable<Sprint[]> {
    return this.http.get<Sprint[]>(`${this.project(projectId)}/sprints`);
  }

  create(projectId: string, body: CreateSprintRequest): Observable<Sprint> {
    return this.http.post<Sprint>(`${this.project(projectId)}/sprints`, body, {
      context: silent(),
    });
  }

  get(sprintId: string): Observable<Sprint> {
    return this.http.get<Sprint>(this.url(sprintId));
  }

  update(sprintId: string, body: UpdateSprintRequest, version: number): Observable<Sprint> {
    return this.http.patch<Sprint>(this.url(sprintId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  /** Freezes the committed points. */
  start(sprintId: string): Observable<Sprint> {
    return this.http.post<Sprint>(`${this.url(sprintId)}/start`, null);
  }

  /** `carryOverTo`: a planned sprint's id, or `BACKLOG`. */
  close(sprintId: string, carryOverTo: string): Observable<Sprint> {
    return this.http.post<Sprint>(
      `${this.url(sprintId)}/close`,
      { carryOverTo },
      { context: silent() },
    );
  }

  /** Tasks already in another sprint move to this one. */
  addTasks(sprintId: string, taskIds: string[]): Observable<Sprint> {
    return this.http.post<Sprint>(`${this.url(sprintId)}/tasks`, { taskIds });
  }

  /** Puts the task back in the backlog. */
  removeTask(sprintId: string, taskId: string): Observable<void> {
    return this.http
      .delete(`${this.url(sprintId)}/tasks/${encodeURIComponent(taskId)}`)
      .pipe(toVoid);
  }

  burndown(sprintId: string): Observable<Burndown> {
    return this.http.get<Burndown>(`${this.url(sprintId)}/burndown`);
  }

  /** Completed points of the last closed sprints (oldest first), with the forecast range. */
  velocity(projectId: string, last?: number): Observable<Velocity> {
    return this.http.get<Velocity>(`${this.project(projectId)}/velocity`, {
      params: toHttpParams({ last }),
    });
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }

  private url(sprintId: string): string {
    return `${API_BASE}/sprints/${encodeURIComponent(sprintId)}`;
  }
}
