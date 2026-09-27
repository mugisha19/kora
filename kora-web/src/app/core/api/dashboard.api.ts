import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardProjectPage, DashboardSummary, ListDashboardProjectsQuery } from './api.models';
import { API_BASE, toHttpParams } from './http-params';

/**
 * The portfolio dashboard's read model (contract tag "Dashboard"). SPI, CPI, critical risks and
 * pending change requests are absent (not null) until the features that produce them exist.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  summary(portfolioId?: string): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${API_BASE}/dashboard/summary`, {
      params: toHttpParams({ portfolioId }),
    });
  }

  /** Default order: severity (RED, AMBER, GREY, GREEN), then name. */
  projects(query: ListDashboardProjectsQuery = {}): Observable<DashboardProjectPage> {
    return this.http.get<DashboardProjectPage>(`${API_BASE}/dashboard/projects`, {
      params: toHttpParams(query),
    });
  }
}
