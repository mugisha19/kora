import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ATTACHMENT_TYPES, Attachment, AttachmentOwnerType } from '../../../../core/api/api.models';
import { AttachmentsApi } from '../../../../core/api/attachments.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { SessionStore } from '../../../../core/session/session.store';
import { formatFileSize } from '../../../../shared/format/file-size';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { AttachmentsStore, UploadRow } from './attachments.store';

const ACCEPT = Object.keys(ATTACHMENT_TYPES)
  .map((e) => `.${e}`)
  .join(',');

function iconFor(contentType: string): string {
  if (contentType === 'application/pdf') return 'picture_as_pdf';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.includes('spreadsheet') || contentType === 'text/csv') return 'table_chart';
  return 'description';
}

/** A small preview of an image attachment, loaded through its short-lived link. */
@Component({
  selector: 'kora-attachment-thumb',
  template: `
    @if (url(); as src) {
      <img [src]="src" alt="" width="40" height="40" loading="lazy" />
    }
  `,
  styles: `
    img {
      display: block;
      inline-size: 40px;
      block-size: 40px;
      border-radius: 4px;
      object-fit: cover;
    }
  `,
})
export class AttachmentThumb implements OnInit {
  readonly attachmentId = input.required<string>();
  private readonly api = inject(AttachmentsApi);
  protected readonly url = signal<string | null>(null);

  ngOnInit(): void {
    firstValueFrom(this.api.download(this.attachmentId())).then(
      (link) => this.url.set(link.url),
      () => this.url.set(null),
    );
  }
}

/**
 * Files on a project, task, risk, issue or change request (feature 20). Drop files on the zone or
 * use the button (keyboard); each upload shows its progress and can be cancelled or retried.
 * Files download through short-lived links; images get a thumbnail.
 */
@Component({
  selector: 'kora-attachments-panel',
  imports: [
    AttachmentThumb,
    ErrorState,
    LoadingState,
    MatButton,
    MatIcon,
    MatIconButton,
    MatProgressBar,
    MatTooltip,
    TranslocoPipe,
  ],
  providers: [AttachmentsStore],
  template: `
    <section class="files" [attr.aria-labelledby]="headingId">
      <h3 [id]="headingId">{{ 'attachments.title' | transloco }}</h3>

      @if (canUpload()) {
        <div
          class="drop"
          [class.over]="dragOver()"
          (dragover)="onDragOver($event)"
          (dragleave)="dragOver.set(false)"
          (drop)="onDrop($event)"
        >
          <mat-icon svgIcon="upload_file" aria-hidden="true" />
          <p>{{ 'attachments.dropHint' | transloco }}</p>
          <button mat-stroked-button type="button" (click)="picker.click()">
            <mat-icon svgIcon="attach_file" aria-hidden="true" />
            {{ 'attachments.choose' | transloco }}
          </button>
          <input #picker type="file" multiple hidden [accept]="accept" (change)="onPick($event)" />
          <p class="rules">{{ 'attachments.rules' | transloco }}</p>
        </div>
      }

      @if (store.uploads().length) {
        <ul class="uploads" [attr.aria-label]="'attachments.uploading' | transloco">
          @for (u of store.uploads(); track u.key) {
            <li [class.failed]="u.state === 'failed' || u.state === 'refused'">
              <div class="line">
                <span class="name">{{ u.file.name }}</span>
                <span class="size">{{ size(u.file.size) }}</span>
                @if (u.state === 'uploading' || u.state === 'checking') {
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'attachments.cancel' | transloco: { name: u.file.name }"
                    [matTooltip]="'attachments.cancel' | transloco: { name: u.file.name }"
                    (click)="store.cancel(u.key)"
                  >
                    <mat-icon svgIcon="close" aria-hidden="true" />
                  </button>
                } @else {
                  @if (u.state === 'failed') {
                    <button mat-button type="button" (click)="store.retry(u.key)">
                      {{ 'attachments.retry' | transloco }}
                    </button>
                  }
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'attachments.dismiss' | transloco: { name: u.file.name }"
                    (click)="store.dismiss(u.key)"
                  >
                    <mat-icon svgIcon="close" aria-hidden="true" />
                  </button>
                }
              </div>
              @if (u.state === 'uploading' || u.state === 'checking') {
                <mat-progress-bar
                  [mode]="u.state === 'checking' ? 'indeterminate' : 'determinate'"
                  [value]="u.percent"
                  [attr.aria-label]="progressLabel(u)"
                />
                <span class="state">{{ progressLabel(u) }}</span>
              } @else {
                <p class="error" role="alert">
                  <mat-icon svgIcon="error" aria-hidden="true" />
                  {{ u.error }}
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (store.loadError()) {
        <kora-error-state (retry)="reload()" />
      } @else if (store.files(); as files) {
        @if (files.length) {
          <ul class="list">
            @for (f of files; track f.id) {
              <li>
                @if (f.contentType.startsWith('image/') && f.scanStatus !== 'INFECTED') {
                  <kora-attachment-thumb [attachmentId]="f.id" />
                } @else {
                  <mat-icon class="kind" [svgIcon]="icon(f.contentType)" aria-hidden="true" />
                }
                <div class="body">
                  @if (f.scanStatus === 'INFECTED') {
                    <span class="name">{{ f.fileName }}</span>
                    <span class="infected">
                      <mat-icon svgIcon="warning" aria-hidden="true" />
                      {{ 'attachments.infected' | transloco }}
                    </span>
                  } @else {
                    <button
                      type="button"
                      class="name link"
                      [attr.aria-label]="'attachments.download' | transloco: { name: f.fileName }"
                      (click)="store.download(f)"
                    >
                      {{ f.fileName }}
                      <mat-icon svgIcon="download" aria-hidden="true" />
                    </button>
                  }
                  <span class="meta">
                    {{ size(f.sizeBytes) }} ·
                    {{
                      'attachments.by'
                        | transloco: { name: f.uploadedBy.fullName, date: date(f.uploadedAt) }
                    }}
                    @if (f.scanStatus === 'NOT_SCANNED') {
                      · {{ 'attachments.notScanned' | transloco }}
                    }
                  </span>
                </div>
                @if (canDelete(f)) {
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'attachments.delete' | transloco: { name: f.fileName }"
                    [matTooltip]="'attachments.delete' | transloco: { name: f.fileName }"
                    (click)="remove(f)"
                  >
                    <mat-icon svgIcon="delete" aria-hidden="true" />
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="kora-muted empty">{{ 'attachments.empty' | transloco }}</p>
        }
      } @else {
        <kora-loading-state />
      }
    </section>
  `,
  styles: `
    h3 {
      margin: 0 0 var(--kora-space-2);
      font: var(--mat-sys-title-small);
    }
    .drop {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kora-space-2);
      padding: var(--kora-space-3);
      border: 2px dashed var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    .drop.over {
      border-color: var(--mat-sys-primary);
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    }
    .drop p {
      margin: 0;
    }
    .rules {
      flex-basis: 100%;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    ul {
      margin: var(--kora-space-2) 0 0;
      padding: 0;
      list-style: none;
    }
    .uploads li {
      padding-block: var(--kora-space-1);
    }
    .line {
      display: flex;
      align-items: center;
      gap: var(--kora-space-2);
    }
    .line .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .size,
    .state,
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      display: flex;
      align-items: center;
      gap: var(--kora-space-1);
      margin: 0;
      color: var(--kora-danger-fg);
      font: var(--mat-sys-body-small);
    }
    .list li {
      display: flex;
      align-items: center;
      gap: var(--kora-space-2);
      padding-block: var(--kora-space-1);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    .kind {
      flex: none;
      inline-size: 40px;
      color: var(--mat-sys-on-surface-variant);
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-inline-size: 0;
    }
    .link {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-1);
      padding: 0;
      border: 0;
      background: none;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-body-medium);
      text-align: start;
      text-decoration: underline;
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .infected {
      display: inline-flex;
      align-items: center;
      gap: var(--kora-space-1);
      color: var(--kora-danger-fg);
      font: var(--mat-sys-body-small);
    }
    .empty {
      margin: var(--kora-space-2) 0 0;
    }
  `,
})
export class AttachmentsPanel {
  readonly ownerType = input.required<AttachmentOwnerType>();
  readonly ownerId = input.required<string>();
  /** Managers and contributors upload; everyone who can see the item downloads. */
  readonly canUpload = input(false);
  /** Managers delete anyone's file; others only their own uploads. */
  readonly canManage = input(false);

  protected readonly store = inject(AttachmentsStore);
  private readonly session = inject(SessionStore);
  private readonly language = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  protected readonly accept = ACCEPT;
  protected readonly dragOver = signal(false);
  protected readonly headingId = `files-${crypto.randomUUID()}`;
  private readonly me = computed(() => this.session.user()?.id);

  constructor() {
    effect(() => {
      const type = this.ownerType();
      const id = this.ownerId();
      untracked(() => void this.store.load(type, id));
    });
  }

  protected reload(): void {
    void this.store.load(this.ownerType(), this.ownerId());
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.add([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.store.add([...(event.dataTransfer?.files ?? [])]);
  }

  protected canDelete(file: Attachment): boolean {
    return this.canManage() || (this.canUpload() && file.uploadedBy.userId === this.me());
  }

  protected async remove(file: Attachment): Promise<void> {
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: this.transloco.translate('attachments.deleteTitle', { name: file.fileName }),
        message: this.transloco.translate('attachments.deleteMessage'),
        confirmLabel: this.transloco.translate('common.delete'),
        destructive: true,
      }),
    );
    if (confirmed) await this.store.delete(file);
  }

  protected progressLabel(u: UploadRow): string {
    return u.state === 'checking'
      ? this.transloco.translate('attachments.checking', { name: u.file.name })
      : this.transloco.translate('attachments.progress', { name: u.file.name, percent: u.percent });
  }

  protected icon(contentType: string): string {
    return iconFor(contentType);
  }

  protected size(bytes: number): string {
    return formatFileSize(bytes, this.language.current());
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.language.current(), { dateStyle: 'medium' }).format(
      new Date(iso),
    );
  }
}
