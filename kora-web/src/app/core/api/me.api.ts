import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MeResponse, UpdateMeRequest } from './api.models';
import { API_BASE } from './http-params';

/** The signed-in user (contract tag "Me"). Not tenant-scoped; no `If-Match` on updates. */
@Injectable({ providedIn: 'root' })
export class MeApi {
  private readonly http = inject(HttpClient);

  get(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${API_BASE}/me`);
  }

  update(body: UpdateMeRequest): Observable<MeResponse> {
    return this.http.patch<MeResponse>(`${API_BASE}/me`, body);
  }
}
