import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription, firstValueFrom, last, tap } from 'rxjs';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  Attachment,
  AttachmentOwnerType,
} from '../../../../core/api/api.models';
import { toApiError } from '../../../../core/api/api-error';
import { AttachmentsApi } from '../../../../core/api/attachments.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { FileDownloader } from '../../../../core/files/file-downloader';
import { StorageUploader, UploadError } from '../../../../core/files/storage-uploader';
import { Notifier } from '../../../../core/notify/notifier';

/** A file on its way: progress, or why it stopped. */
export interface UploadRow {
  readonly key: string;
  readonly file: File;
  readonly percent: number;
  readonly state: 'uploading' | 'checking' | 'failed' | 'refused';
  readonly error?: string;
}

/** The content type the API expects for a file name, or null when the type isn't accepted. */
export function contentTypeOf(fileName: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';
  return ATTACHMENT_TYPES[extension] ?? null;
}

/**
 * One owner's files (feature 20): the list, and uploads in three steps (start → PUT to storage →
 * complete). Files the API would refuse (type, size) are refused here first, before any bytes
 * move. Each upload can be cancelled and a failed one retried.
 */
@Injectable()
export class AttachmentsStore {
  private readonly api = inject(AttachmentsApi);
  private readonly uploader = inject(StorageUploader);
  private readonly downloader = inject(FileDownloader);
  private readonly messages = inject(ErrorMessages);
  private readonly notifier = inject(Notifier);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);

  private owner: { type: AttachmentOwnerType; id: string } | null = null;
  private readonly running = new Map<string, Subscription>();

  readonly files = signal<Attachment[] | null>(null);
  readonly loadError = signal(false);
  readonly uploads = signal<UploadRow[]>([]);

  async load(type: AttachmentOwnerType, id: string): Promise<void> {
    this.owner = { type, id };
    this.loadError.set(false);
    try {
      this.files.set(await firstValueFrom(this.api.list(type, id)));
    } catch {
      this.loadError.set(true);
    }
  }

  add(files: readonly File[]): void {
    for (const file of files) this.start(file);
  }

  cancel(key: string): void {
    this.running.get(key)?.unsubscribe();
    this.running.delete(key);
    this.remove(key);
    void this.announcer.announce(this.transloco.translate('attachments.cancelled'), 'polite');
  }

  retry(key: string): void {
    const row = this.uploads().find((u) => u.key === key);
    if (!row) return;
    this.remove(key);
    this.start(row.file);
  }

  dismiss(key: string): void {
    this.remove(key);
  }

  async download(file: Attachment): Promise<void> {
    const link = await firstValueFrom(this.api.download(file.id));
    this.downloader.open(link.url, file.fileName);
  }

  async delete(file: Attachment): Promise<void> {
    await firstValueFrom(this.api.remove(file.id));
    this.files.update((list) => list?.filter((f) => f.id !== file.id) ?? null);
    this.notifier.success(this.transloco.translate('attachments.deleted', { name: file.fileName }));
  }

  private start(file: File): void {
    const key = crypto.randomUUID();
    const contentType = contentTypeOf(file.name);
    const refused = !contentType
      ? this.transloco.translate('attachments.errors.type')
      : file.size > ATTACHMENT_MAX_BYTES
        ? this.transloco.translate('attachments.errors.size')
        : file.size === 0
          ? this.transloco.translate('attachments.errors.empty')
          : null;
    if (refused || !contentType || !this.owner) {
      this.uploads.update((rows) => [
        ...rows,
        { key, file, percent: 0, state: 'refused', error: refused ?? undefined },
      ]);
      return;
    }
    this.uploads.update((rows) => [...rows, { key, file, percent: 0, state: 'uploading' }]);
    const owner = this.owner;
    const run = async () => {
      const started = await firstValueFrom(
        this.api.start({
          ownerType: owner.type,
          ownerId: owner.id,
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const subscription = this.uploader
          .upload(started.uploadUrl, started.uploadHeaders, file)
          .pipe(
            tap((event) => {
              if (event.type === 'progress' && event.total > 0) {
                this.patch(key, { percent: Math.round((event.loaded / event.total) * 100) });
              }
            }),
            last(),
          )
          .subscribe({ next: () => resolve(), error: reject });
        this.running.set(key, subscription);
      });
      this.running.delete(key);
      if (!this.uploads().some((u) => u.key === key)) return;
      this.patch(key, { percent: 100, state: 'checking' });
      const done = await firstValueFrom(this.api.complete(started.attachment.id));
      this.remove(key);
      if (this.owner?.id === owner.id) {
        this.files.update((list) => [done, ...(list ?? [])]);
      }
      void this.announcer.announce(
        this.transloco.translate('attachments.uploaded', { name: file.name }),
        'polite',
      );
    };
    run().catch((error: unknown) => {
      this.running.delete(key);
      if (!this.uploads().some((u) => u.key === key)) return;
      if (error instanceof UploadError) {
        this.patch(key, {
          state: 'failed',
          error: this.transloco.translate('attachments.errors.network'),
        });
        return;
      }
      // The same file would be refused again (type, size, content): no "Try again" for those.
      const apiError = toApiError(error);
      const final =
        apiError.status === 400 ||
        apiError.status === 403 ||
        apiError.code === 'attachments.content_mismatch';
      this.patch(key, { state: final ? 'refused' : 'failed', error: this.explain(error) });
    });
  }

  private explain(error: unknown): string {
    const apiError = toApiError(error);
    const field = apiError.fieldErrors[0];
    return field ? this.messages.fieldMessage(field) : this.messages.message(apiError);
  }

  private patch(key: string, change: Partial<UploadRow>): void {
    this.uploads.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  private remove(key: string): void {
    this.uploads.update((rows) => rows.filter((r) => r.key !== key));
  }
}
