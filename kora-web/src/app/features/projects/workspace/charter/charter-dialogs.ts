import { Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Charter } from '../../../../core/api/api.models';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { LanguageService } from '../../../../core/i18n/language.service';
import { FieldError } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { formatLocalizedDate } from '../../../../shared/forms/localized-date.pipe';
import { charterSections, diffCharters } from './charter-sections';

// ---------- Return with a comment ----------

export interface ReturnDialogData {
  returnToDraft: (comment: string) => Promise<void>;
}

/** Sends a submitted charter back to the PM as a draft, saying what to change. */
@Component({
  selector: 'kora-return-charter-dialog',
  imports: [
    FieldError,
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatIcon,
    MatInput,
    MatLabel,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'charter.returnTitle' | transloco }}</h2>
    <form class="kora-form" novalidate (submit)="save($event)">
      <mat-dialog-content>
        @if (formError()) {
          <div class="kora-notice error" role="alert">
            <mat-icon svgIcon="error" aria-hidden="true" />
            <p>{{ formError() }}</p>
          </div>
        }
        <mat-form-field>
          <mat-label>{{ 'charter.returnComment' | transloco }}</mat-label>
          <textarea matInput rows="4" [formField]="form.comment"></textarea>
          <mat-error><kora-field-error [field]="form.comment" /></mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="form().submitting()">
          {{ 'charter.return' | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(440px, calc(100vw - 96px));
    }
  `,
})
export class ReturnCharterDialog {
  private readonly data = inject<ReturnDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ReturnCharterDialog, boolean>);

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal({ comment: '' });
  protected readonly form = form(this.model, (path) => {
    required(path.comment);
    maxLength(path.comment, 2000);
  });
  private readonly context = {
    messages: inject(ErrorMessages),
    formError: this.formError,
    host: inject(ElementRef<HTMLElement>),
    injector: inject(Injector),
  };

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const comment = this.model().comment.trim();
    if (await submitWithApi(this.form, this.context, () => this.data.returnToDraft(comment))) {
      this.dialogRef.close(true);
    }
  }
}

// ---------- Versions ----------

export interface VersionsDialogData {
  versions: Charter[];
}

/**
 * Charter history: pick two versions and compare them side by side, section by section. Changes
 * are marked in words ("Added", "Removed", "Changed"), not only by colour.
 */
@Component({
  selector: 'kora-charter-versions-dialog',
  imports: [
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatLabel,
    MatOption,
    MatSelect,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'charter.versions.title' | transloco }}</h2>
    <mat-dialog-content>
      @if (versions.length < 2) {
        <p>{{ 'charter.versions.onlyOne' | transloco }}</p>
      } @else {
        <div class="pickers">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'charter.versions.from' | transloco }}</mat-label>
            <mat-select [value]="beforeNumber()" (selectionChange)="beforeNumber.set($event.value)">
              @for (version of versions; track version.versionNumber) {
                <mat-option [value]="version.versionNumber">
                  {{ 'charter.versions.label' | transloco: { n: version.versionNumber } }} ·
                  {{ 'charterStatus.' + version.status | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>{{ 'charter.versions.to' | transloco }}</mat-label>
            <mat-select [value]="afterNumber()" (selectionChange)="afterNumber.set($event.value)">
              @for (version of versions; track version.versionNumber) {
                <mat-option [value]="version.versionNumber">
                  {{ 'charter.versions.label' | transloco: { n: version.versionNumber } }} ·
                  {{ 'charterStatus.' + version.status | transloco }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        <table class="diff">
          <caption class="visually-hidden">
            {{
              'charter.versions.title' | transloco
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">{{ 'charter.versions.section' | transloco }}</th>
              <th scope="col">
                {{ 'charter.versions.label' | transloco: { n: beforeNumber() } }}
              </th>
              <th scope="col">
                {{ 'charter.versions.label' | transloco: { n: afterNumber() } }}
              </th>
            </tr>
          </thead>
          <tbody>
            @for (row of diff(); track row.key) {
              <tr [class.changed]="row.changed">
                <th scope="row">
                  {{ 'charter.fields.' + row.key | transloco }}
                  @if (row.changed) {
                    <span class="tag">{{ 'charter.versions.changed' | transloco }}</span>
                  }
                </th>
                <td>
                  @for (item of row.before; track $index) {
                    <p [class]="item.mark">
                      @if (item.mark === 'removed') {
                        <span class="tag">{{ 'charter.versions.removed' | transloco }}</span>
                      }
                      {{ item.text }}
                    </p>
                  } @empty {
                    <p class="kora-muted">—</p>
                  }
                </td>
                <td>
                  @for (item of row.after; track $index) {
                    <p [class]="item.mark">
                      @if (item.mark === 'added') {
                        <span class="tag">{{ 'charter.versions.added' | transloco }}</span>
                      }
                      {{ item.text }}
                    </p>
                  } @empty {
                    <p class="kora-muted">—</p>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.close' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-inline-size: min(760px, calc(100vw - 96px));
    }
    .pickers {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-3);
      margin-block: var(--kora-space-2) var(--kora-space-4);
    }
    .diff {
      inline-size: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: var(--kora-space-2);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      text-align: start;
      vertical-align: top;
    }
    tbody th {
      inline-size: 22%;
      font: var(--mat-sys-title-small);
    }
    p {
      margin: 0 0 var(--kora-space-1);
    }
    .tag {
      display: inline-block;
      margin-inline-end: var(--kora-space-1);
      padding: 0 var(--kora-space-1);
      border-radius: 4px;
      font: var(--mat-sys-label-small);
      text-transform: uppercase;
    }
    tr.changed th .tag {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
    }
    .added .tag {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    .removed {
      text-decoration: line-through;
    }
    .removed .tag {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
      text-decoration: none;
    }
  `,
})
export class CharterVersionsDialog {
  protected readonly versions = inject<VersionsDialogData>(MAT_DIALOG_DATA).versions;
  private readonly language = inject(LanguageService);

  /** Newest first: compare the previous version with the latest by default. */
  protected readonly afterNumber = signal(this.versions[0]?.versionNumber ?? 1);
  protected readonly beforeNumber = signal(this.versions[1]?.versionNumber ?? 1);

  protected readonly diff = computed(() => {
    const locale = this.language.current();
    const format = { locale, date: (d: string) => formatLocalizedDate(d, locale) };
    const find = (n: number) =>
      this.versions.find((v) => v.versionNumber === n) ?? this.versions[0];
    return diffCharters(
      charterSections(find(this.beforeNumber()), format),
      charterSections(find(this.afterNumber()), format),
    );
  });
}
