import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateWbsNodeRequest,
  MoveWbsNodeRequest,
  UpdateWbsNodeRequest,
  WbsNode,
  WbsTree,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, ifMatch, toVoid } from './http-params';

/**
 * Work breakdown structure (contract tag "WBS"). Node forms show their own errors (silent);
 * delete and move keep the global toast.
 */
@Injectable({ providedIn: 'root' })
export class WbsApi {
  private readonly http = inject(HttpClient);

  /** The whole tree with rolled-up values. */
  get(projectId: string): Observable<WbsTree> {
    return this.http.get<WbsTree>(`${API_BASE}/projects/${encodeURIComponent(projectId)}/wbs`);
  }

  create(projectId: string, body: CreateWbsNodeRequest): Observable<WbsNode> {
    return this.http.post<WbsNode>(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/wbs/nodes`,
      body,
      { context: silent() },
    );
  }

  /** Returns only the node (its subtree rolled up); refetch the tree to update ancestors. */
  update(nodeId: string, body: UpdateWbsNodeRequest, version: number): Observable<WbsNode> {
    return this.http.patch<WbsNode>(this.url(nodeId), body, {
      headers: { 'If-Match': ifMatch(version) },
      context: silent(),
    });
  }

  /** `cascade` also deletes every descendant (409 `wbs.has_children` without it). */
  delete(nodeId: string, cascade = false): Observable<void> {
    return this.http
      .delete(this.url(nodeId), { params: cascade ? { cascade: 'true' } : {} })
      .pipe(toVoid);
  }

  /** Codes are renumbered, so the whole tree comes back. */
  move(nodeId: string, body: MoveWbsNodeRequest): Observable<WbsTree> {
    return this.http.post<WbsTree>(`${this.url(nodeId)}/move`, body);
  }

  private url(nodeId: string): string {
    return `${API_BASE}/wbs/nodes/${encodeURIComponent(nodeId)}`;
  }
}
