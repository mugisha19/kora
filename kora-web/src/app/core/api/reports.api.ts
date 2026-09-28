import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateReportRequest, ReportJob } from './api.models';
import { SKIP_LOADING, silent } from './http-context';
import { API_BASE } from './http-params';

/**
 * PDF and Excel exports made in the background (contract tag "Reports"). `create` queues a job;
 * the job is READY when its REPORT_READY notification arrives or a poll says so. A READY job's
 * download link lasts five minutes, so get the job again for a fresh one.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  /** Silent: the export menu explains a refusal (too many waiting, no access) itself. */
  create(request: CreateReportRequest): Observable<ReportJob> {
    return this.http.post<ReportJob>(`${API_BASE}/reports`, request, { context: silent() });
  }

  /** My last 50 jobs, newest first. Polled in the background while jobs wait. */
  list(): Observable<ReportJob[]> {
    return this.http.get<ReportJob[]>(`${API_BASE}/reports`, {
      context: new HttpContext().set(SKIP_LOADING, true),
    });
  }

  get(reportId: string): Observable<ReportJob> {
    return this.http.get<ReportJob>(`${API_BASE}/reports/${encodeURIComponent(reportId)}`);
  }
}
