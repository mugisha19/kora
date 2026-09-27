import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CostRate,
  CreateCostRateRequest,
  ListProjectTimesheetsQuery,
  Timesheet,
  TimesheetEntryInput,
  TimesheetPage,
  TimesheetWeek,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, toHttpParams } from './http-params';

/**
 * Timesheets and cost rates (contract tag "Timesheets"). A week ("2026-W40") holds one sheet per
 * project; saving replaces the week's editable entries. Saves are silent because the grid shows
 * the error next to the cells (daily total above 24 h, a locked project).
 */
@Injectable({ providedIn: 'root' })
export class TimesheetsApi {
  private readonly http = inject(HttpClient);

  /** My week; the current one in the organization's time zone when `week` is omitted. */
  week(week?: string): Observable<TimesheetWeek> {
    return this.http.get<TimesheetWeek>(`${API_BASE}/timesheets/me`, {
      params: toHttpParams({ week }),
    });
  }

  saveEntries(week: string, entries: TimesheetEntryInput[]): Observable<TimesheetWeek> {
    return this.http.put<TimesheetWeek>(
      `${API_BASE}/timesheets/me/${encodeURIComponent(week)}/entries`,
      { entries },
      { context: silent() },
    );
  }

  submit(week: string): Observable<TimesheetWeek> {
    return this.http.post<TimesheetWeek>(
      `${API_BASE}/timesheets/me/${encodeURIComponent(week)}/submit`,
      null,
      { context: silent() },
    );
  }

  /** The project's managers; oldest week first. */
  forProject(projectId: string, query: ListProjectTimesheetsQuery = {}): Observable<TimesheetPage> {
    return this.http.get<TimesheetPage>(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/timesheets`,
      { params: toHttpParams(query) },
    );
  }

  get(timesheetId: string): Observable<Timesheet> {
    return this.http.get<Timesheet>(this.url(timesheetId));
  }

  approve(timesheetId: string): Observable<Timesheet> {
    return this.http.post<Timesheet>(`${this.url(timesheetId)}/approve`, null, {
      context: silent(),
    });
  }

  reject(timesheetId: string, comment: string): Observable<Timesheet> {
    return this.http.post<Timesheet>(
      `${this.url(timesheetId)}/reject`,
      { comment },
      { context: silent() },
    );
  }

  /** ORG_ADMIN and PMO only (rates are confidential); newest first. */
  costRates(userId: string): Observable<CostRate[]> {
    return this.http.get<CostRate[]>(`${API_BASE}/users/${encodeURIComponent(userId)}/cost-rates`);
  }

  addCostRate(userId: string, body: CreateCostRateRequest): Observable<CostRate> {
    return this.http.post<CostRate>(
      `${API_BASE}/users/${encodeURIComponent(userId)}/cost-rates`,
      body,
      { context: silent() },
    );
  }

  private url(timesheetId: string): string {
    return `${API_BASE}/timesheets/${encodeURIComponent(timesheetId)}`;
  }
}
