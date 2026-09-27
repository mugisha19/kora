import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreatePortfolioRequest,
  CreateProgramRequest,
  ListPortfoliosQuery,
  Portfolio,
  PortfolioPage,
  Program,
  UpdatePortfolioRequest,
  UpdateProgramRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/**
 * Portfolios and their programs (contract tag "Portfolios"). Creates and updates are silent in the
 * error toast: they always come from a form that shows the error itself.
 */
@Injectable({ providedIn: 'root' })
export class PortfoliosApi {
  private readonly http = inject(HttpClient);

  list(query: ListPortfoliosQuery = {}): Observable<PortfolioPage> {
    return this.http.get<PortfolioPage>(`${API_BASE}/portfolios`, { params: toHttpParams(query) });
  }

  get(portfolioId: string): Observable<Portfolio> {
    return this.http.get<Portfolio>(this.url(portfolioId));
  }

  create(body: CreatePortfolioRequest): Observable<Portfolio> {
    return this.http.post<Portfolio>(`${API_BASE}/portfolios`, body, { context: silent() });
  }

  update(
    portfolioId: string,
    body: UpdatePortfolioRequest,
    version: number,
  ): Observable<Portfolio> {
    return this.http.patch<Portfolio>(this.url(portfolioId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  /** Only empty portfolios can be deleted (409 `portfolios.not_empty`, toasted). */
  delete(portfolioId: string): Observable<void> {
    return this.http.delete(this.url(portfolioId)).pipe(toVoid);
  }

  listPrograms(portfolioId: string): Observable<Program[]> {
    return this.http.get<Program[]>(`${this.url(portfolioId)}/programs`);
  }

  createProgram(portfolioId: string, body: CreateProgramRequest): Observable<Program> {
    return this.http.post<Program>(`${this.url(portfolioId)}/programs`, body, {
      context: silent(),
    });
  }

  getProgram(programId: string): Observable<Program> {
    return this.http.get<Program>(`${API_BASE}/programs/${encodeURIComponent(programId)}`);
  }

  updateProgram(
    programId: string,
    body: UpdateProgramRequest,
    version: number,
  ): Observable<Program> {
    return this.http.patch<Program>(`${API_BASE}/programs/${encodeURIComponent(programId)}`, body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  private url(portfolioId: string): string {
    return `${API_BASE}/portfolios/${encodeURIComponent(portfolioId)}`;
  }
}
