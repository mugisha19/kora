import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Attachment,
  AttachmentDownload,
  AttachmentOwnerType,
  AttachmentUpload,
  StartUploadRequest,
} from './api.models';
import { silent } from './http-context';
import { API_BASE, toHttpParams, toVoid } from './http-params';

/**
 * Files on projects, tasks, risks, issues and change requests (contract tag "Attachments"). An
 * upload has three steps: `start` returns a presigned URL, the browser PUTs the bytes straight to
 * storage (`StorageUploader`), then `complete` checks them. Upload calls are silent: the panel shows
 * the error on the file's row.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly http = inject(HttpClient);

  /** Available files, newest first. */
  list(ownerType: AttachmentOwnerType, ownerId: string): Observable<Attachment[]> {
    return this.http.get<Attachment[]>(`${API_BASE}/attachments`, {
      params: toHttpParams({ ownerType, ownerId }),
    });
  }

  start(request: StartUploadRequest): Observable<AttachmentUpload> {
    return this.http.post<AttachmentUpload>(`${API_BASE}/attachments/uploads`, request, {
      context: silent(),
    });
  }

  complete(attachmentId: string): Observable<Attachment> {
    return this.http.post<Attachment>(`${this.url(attachmentId)}/complete`, null, {
      context: silent(),
    });
  }

  /** A short-lived link that always downloads. */
  download(attachmentId: string): Observable<AttachmentDownload> {
    return this.http.get<AttachmentDownload>(`${this.url(attachmentId)}/download`);
  }

  remove(attachmentId: string): Observable<void> {
    return this.http.delete(this.url(attachmentId)).pipe(toVoid);
  }

  private url(attachmentId: string): string {
    return `${API_BASE}/attachments/${encodeURIComponent(attachmentId)}`;
  }
}
