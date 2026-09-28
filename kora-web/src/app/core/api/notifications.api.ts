import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppNotification,
  ListNotificationsQuery,
  NotificationPage,
  NotificationPreference,
  NotificationPreferences,
} from './api.models';
import { SKIP_LOADING, silent } from './http-context';
import { API_BASE, toHttpParams, toVoid } from './http-params';

/**
 * My notifications and how they reach me (contract tag "Notifications"). New ones also arrive live
 * over STOMP (`LiveUpdates`); these calls load the list and mark notifications read. The bell
 * loads in the background, so its requests don't drive the progress bar.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  /** Newest first; follow `nextCursor` until it is absent. */
  list(query: ListNotificationsQuery = {}): Observable<NotificationPage> {
    return this.http.get<NotificationPage>(`${API_BASE}/notifications`, {
      params: toHttpParams(query),
      context: new HttpContext().set(SKIP_LOADING, true),
    });
  }

  markRead(notificationId: string): Observable<AppNotification> {
    return this.http.post<AppNotification>(
      `${API_BASE}/notifications/${encodeURIComponent(notificationId)}/read`,
      null,
    );
  }

  markAllRead(): Observable<void> {
    return this.http.post(`${API_BASE}/notifications/read-all`, null).pipe(toVoid);
  }

  /** Per person across organizations (no organization header). */
  preferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${API_BASE}/me/notification-preferences`);
  }

  /** Kinds left out keep their setting. Silent: the settings form shows the error. */
  updatePreferences(preferences: NotificationPreference[]): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(
      `${API_BASE}/me/notification-preferences`,
      { preferences },
      { context: silent() },
    );
  }
}
