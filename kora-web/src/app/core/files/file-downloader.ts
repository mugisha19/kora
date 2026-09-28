import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

/**
 * Starts the download of a short-lived link. Attachment and report links answer with
 * `Content-Disposition: attachment`, so the browser saves the file and the page stays put.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloader {
  private readonly document = inject(DOCUMENT);

  /** Saves text made in the browser (a CSV export) as a file. */
  save(content: string, fileName: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    this.open(url, fileName);
    // Long enough for the browser to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  open(url: string, fileName?: string): void {
    const link = this.document.createElement('a');
    link.href = url;
    if (fileName) link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    this.document.body.append(link);
    link.click();
    link.remove();
  }
}
