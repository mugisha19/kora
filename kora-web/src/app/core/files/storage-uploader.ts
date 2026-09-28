import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type UploadEvent =
  | { readonly type: 'progress'; readonly loaded: number; readonly total: number }
  | { readonly type: 'done' };

/** The storage refused or the network failed (`status` 0) while sending the bytes. */
export class UploadError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed with status ${status}`);
  }
}

/**
 * Sends a file straight to storage with a presigned PUT (feature 20). Uses XMLHttpRequest because
 * fetch can't report upload progress; sends exactly the headers the API returned and never the
 * access token (the URL is the permission). Unsubscribing cancels the upload.
 */
@Injectable({ providedIn: 'root' })
export class StorageUploader {
  upload(
    url: string,
    headers: Readonly<Record<string, string>>,
    file: Blob,
  ): Observable<UploadEvent> {
    return new Observable<UploadEvent>((subscriber) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) =>
        subscriber.next({
          type: 'progress',
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : file.size,
        });
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          subscriber.next({ type: 'done' });
          subscriber.complete();
        } else {
          subscriber.error(new UploadError(xhr.status));
        }
      };
      xhr.onerror = () => subscriber.error(new UploadError(0));
      xhr.send(file);
      return () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) xhr.abort();
      };
    });
  }
}
