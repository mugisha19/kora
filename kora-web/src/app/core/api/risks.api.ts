import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AssessRiskRequest,
  CreateRiskRequest,
  Issue,
  ListPortfolioRisksQuery,
  ListRisksQuery,
  MaterializeRiskRequest,
  Risk,
  RiskAssessment,
  RiskHeatmap,
  RiskHeatmapQuery,
  RiskPage,
  UpdateRiskRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams } from './http-params';

/**
 * The risk register (contract tag "Risks"). Probability and impact change only through
 * `assess()`, so the scoring history is complete. Form writes are silent: the dialog shows the
 * error.
 */
@Injectable({ providedIn: 'root' })
export class RisksApi {
  private readonly http = inject(HttpClient);

  list(projectId: string, query: ListRisksQuery = {}): Observable<RiskPage> {
    return this.http.get<RiskPage>(`${this.project(projectId)}/risks`, {
      params: toHttpParams(query),
    });
  }

  /** Open risks only; takes the register's kind, category and owner filters so counts match. */
  heatmap(projectId: string, query: RiskHeatmapQuery = {}): Observable<RiskHeatmap> {
    return this.http.get<RiskHeatmap>(`${this.project(projectId)}/risks/heatmap`, {
      params: toHttpParams(query),
    });
  }

  /** Open risks across the projects the caller sees (default: critical, 15 and up). */
  portfolio(query: ListPortfolioRisksQuery = {}): Observable<RiskPage> {
    return this.http.get<RiskPage>(`${API_BASE}/risks`, { params: toHttpParams(query) });
  }

  create(projectId: string, body: CreateRiskRequest): Observable<Risk> {
    return this.http.post<Risk>(`${this.project(projectId)}/risks`, body, { context: silent() });
  }

  get(riskId: string): Observable<Risk> {
    return this.http.get<Risk>(this.url(riskId));
  }

  update(riskId: string, body: UpdateRiskRequest, version: number): Observable<Risk> {
    return this.http.patch<Risk>(this.url(riskId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  /** Oldest first. */
  assessments(riskId: string): Observable<RiskAssessment[]> {
    return this.http.get<RiskAssessment[]>(`${this.url(riskId)}/assessments`);
  }

  assess(riskId: string, body: AssessRiskRequest): Observable<RiskAssessment> {
    return this.http.post<RiskAssessment>(`${this.url(riskId)}/assessments`, body, {
      context: silent(),
    });
  }

  close(riskId: string, note: string): Observable<Risk> {
    return this.http.post<Risk>(`${this.url(riskId)}/close`, { note }, { context: silent() });
  }

  /** The risk happened: opens a linked issue and closes the risk, in one step. */
  materialize(riskId: string, body: MaterializeRiskRequest): Observable<Issue> {
    return this.http.post<Issue>(`${this.url(riskId)}/materialize`, body, { context: silent() });
  }

  private url(riskId: string): string {
    return `${API_BASE}/risks/${encodeURIComponent(riskId)}`;
  }

  private project(projectId: string): string {
    return `${API_BASE}/projects/${encodeURIComponent(projectId)}`;
  }
}
