import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Board,
  BoardColumnSettings,
  BoardStatus,
  CreateTaskRequest,
  ListTasksQuery,
  MoveTaskRequest,
  Task,
  TaskComment,
  TaskPage,
  UpdateTaskRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * Tasks, the Kanban board and comments (contract tag "Tasks"). Status changes only through
 * `move()`. Form writes are silent (the form shows the error); `move()` is silent too, because
 * the board handles its answers itself (WIP limit → "move anyway", a reason for BLOCKED,
 * snapping the card back).
 */
@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly http = inject(HttpClient);

  list(projectId: string, query: ListTasksQuery = {}): Observable<TaskPage> {
    return this.http.get<TaskPage>(`${this.project(projectId)}/tasks`, {
      params: toHttpParams(query),
    });
  }

  create(projectId: string, body: CreateTaskRequest): Observable<Task> {
    return this.http.post<Task>(`${this.project(projectId)}/tasks`, body, { context: silent() });
  }

  get(taskId: string): Observable<Task> {
    return this.http.get<Task>(this.url(taskId));
  }

  update(taskId: string, body: UpdateTaskRequest, version: number): Observable<Task> {
    return this.http.patch<Task>(this.url(taskId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  delete(taskId: string): Observable<void> {
    return this.http.delete(this.url(taskId)).pipe(toVoid);
  }

  move(taskId: string, body: MoveTaskRequest): Observable<Task> {
    return this.http.post<Task>(`${this.url(taskId)}/move`, body, { context: silent() });
  }

  comments(taskId: string): Observable<TaskComment[]> {
    return this.http.get<TaskComment[]>(`${this.url(taskId)}/comments`);
  }

  addComment(taskId: string, body: string): Observable<TaskComment> {
    return this.http.post<TaskComment>(
      `${this.url(taskId)}/comments`,
      { body },
      { context: silent() },
    );
  }

  /** Every task that isn't in the backlog, or one sprint's tasks. */
  board(projectId: string, sprintId?: string): Observable<Board> {
    return this.http.get<Board>(`${this.project(projectId)}/board`, {
      params: toHttpParams({ sprintId }),
    });
  }

  /** Rename a column or set its WIP limit (omit `wipLimit` for none). */
  configureColumn(
    projectId: string,
    status: BoardStatus,
    body: BoardColumnSettings,
  ): Observable<BoardColumnSettings> {
    return this.http.put<BoardColumnSettings>(
      `${this.project(projectId)}/board/columns/${status}`,
      body,
      { context: silent() },
    );
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }

  private url(taskId: string): string {
    return `${API_BASE}/tasks/${encodeURIComponent(taskId)}`;
  }
}
