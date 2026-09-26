import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ListMembersQuery, Member, MemberPage, Role } from './api.models';
import { API_BASE, ifMatch, toHttpParams, toVoid } from './http-params';

/** People in the active organization (contract tag "Members"). */
@Injectable({ providedIn: 'root' })
export class MembersApi {
  private readonly http = inject(HttpClient);

  list(query: ListMembersQuery = {}): Observable<MemberPage> {
    return this.http.get<MemberPage>(`${API_BASE}/members`, { params: toHttpParams(query) });
  }

  changeRole(memberId: string, role: Role, version: number): Observable<Member> {
    return this.http.patch<Member>(
      `${API_BASE}/members/${encodeURIComponent(memberId)}`,
      { role },
      { headers: { 'If-Match': ifMatch(version) } },
    );
  }

  remove(memberId: string): Observable<void> {
    return this.http.delete(`${API_BASE}/members/${encodeURIComponent(memberId)}`).pipe(toVoid);
  }
}
