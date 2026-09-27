import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DashboardTrends,
  EvmReport,
  EvmSeries,
  EvmSettings,
  UpdateEvmSettingsRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams } from './http-params';

/**
 * Earned value (contract tag "EarnedValue"): the metrics as of today, the weekly S-curve, the
 * project's methods, and the portfolio's monthly trends. Figures that would divide by zero are
 * absent and listed in `unavailable` with the reason.
 */
@Injectable({ providedIn: 'root' })
export class EvmApi {
  private readonly http = inject(HttpClient);

  report(projectId: string): Observable<EvmReport> {
    return this.http.get<EvmReport>(`${this.project(projectId)}/evm`);
  }

  series(projectId: string, query: { from?: string; to?: string } = {}): Observable<EvmSeries> {
    return this.http.get<EvmSeries>(`${this.project(projectId)}/evm/series`, {
      params: toHttpParams(query),
    });
  }

  settings(projectId: string): Observable<EvmSettings> {
    return this.http.get<EvmSettings>(`${this.project(projectId)}/evm/settings`);
  }

  updateSettings(
    projectId: string,
    body: UpdateEvmSettingsRequest,
    version: number,
  ): Observable<EvmSettings> {
    return this.http.put<EvmSettings>(`${this.project(projectId)}/evm/settings`, body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  /** Oldest month first. */
  trends(months = 6, portfolioId?: string): Observable<DashboardTrends> {
    return this.http.get<DashboardTrends>(`${API_BASE}/dashboard/trends`, {
      params: toHttpParams({ months, portfolioId }),
    });
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
