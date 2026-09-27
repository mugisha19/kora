import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateProjectRequest,
  HealthOverrideRequest,
  ListProjectsQuery,
  Project,
  ProjectMember,
  ProjectPage,
  PutProjectMemberRequest,
  TransitionRequest,
  UpdateProjectRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * Projects, their lifecycle, health override and team (contract tag "Projects"). Calls made from a
 * form or dialog are silent in the error toast; the form shows the error.
 */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  list(query: ListProjectsQuery = {}): Observable<ProjectPage> {
    return this.http.get<ProjectPage>(`${API_BASE}/projects`, { params: toHttpParams(query) });
  }

  get(projectId: string): Observable<Project> {
    return this.http.get<Project>(this.url(projectId));
  }

  create(body: CreateProjectRequest): Observable<Project> {
    return this.http.post<Project>(`${API_BASE}/projects`, body, { context: silent() });
  }

  update(projectId: string, body: UpdateProjectRequest, version: number): Observable<Project> {
    return this.http.patch<Project>(this.url(projectId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  transition(projectId: string, body: TransitionRequest): Observable<Project> {
    return this.http.post<Project>(`${this.url(projectId)}/transitions`, body, {
      context: silent(),
    });
  }

  overrideHealth(projectId: string, body: HealthOverrideRequest): Observable<Project> {
    return this.http.put<Project>(`${this.url(projectId)}/health-override`, body, {
      context: silent(),
    });
  }

  clearHealthOverride(projectId: string): Observable<Project> {
    return this.http.delete<Project>(`${this.url(projectId)}/health-override`);
  }

  listMembers(projectId: string): Observable<ProjectMember[]> {
    return this.http.get<ProjectMember[]>(`${this.url(projectId)}/members`);
  }

  putMember(
    projectId: string,
    userId: string,
    body: PutProjectMemberRequest,
  ): Observable<ProjectMember> {
    return this.http.put<ProjectMember>(
      `${this.url(projectId)}/members/${encodeURIComponent(userId)}`,
      body,
    );
  }

  removeMember(projectId: string, userId: string): Observable<void> {
    return this.http
      .delete(`${this.url(projectId)}/members/${encodeURIComponent(userId)}`)
      .pipe(toVoid);
  }

  private url(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
