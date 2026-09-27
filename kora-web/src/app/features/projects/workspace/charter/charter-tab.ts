import { Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../../core/i18n/language.service';
import {
  LocalizedDatePipe,
  formatLocalizedDate,
} from '../../../../shared/forms/localized-date.pipe';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ProjectStore } from '../project.store';
import {
  CharterVersionsDialog,
  ReturnCharterDialog,
  ReturnDialogData,
  VersionsDialogData,
} from './charter-dialogs';
import { CharterEditor } from './charter-editor';
import { CHARTER_STATUS_LOOK, charterSections } from './charter-sections';
import { CharterStore } from './charter.store';

/**
 * Charter tab (feature 06): the charter as a readable, printable document; the PM edits and
 * submits the draft; the sponsor, PMO or an admin approves it (authorizing the project) or returns
 * it with a comment. An approved charter is read-only; later changes go through change requests.
 */
@Component({
  selector: 'kora-charter-tab',
  imports: [
    CharterEditor,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatIcon,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [CharterStore],
  templateUrl: './charter-tab.html',
  styleUrl: './charter-tab.scss',
})
export class CharterTab {
  protected readonly store = inject(CharterStore);
  protected readonly project = inject(ProjectStore);
  protected readonly language = inject(LanguageService);
  private readonly dialog = inject(MatDialog);

  protected readonly editing = signal(false);
  protected readonly statusLook = CHARTER_STATUS_LOOK;
  protected readonly sections = computed(() => {
    const charter = this.store.charter();
    const locale = this.language.current();
    return charter
      ? charterSections(charter, { locale, date: (d) => formatLocalizedDate(d, locale) })
      : [];
  });

  constructor() {
    void this.store.load();
  }

  protected edit(): void {
    this.store.dismissError();
    this.editing.set(true);
  }

  protected async submit(): Promise<void> {
    await this.store.submit();
  }

  protected async approve(): Promise<void> {
    await this.store.approve();
  }

  protected returnToDraft(): void {
    this.dialog.open<ReturnCharterDialog, ReturnDialogData>(ReturnCharterDialog, {
      data: { returnToDraft: (comment) => this.store.returnToDraft(comment) },
    });
  }

  protected async showVersions(): Promise<void> {
    const versions = await this.store.versions().catch(() => null);
    if (!versions) return;
    this.dialog.open<CharterVersionsDialog, VersionsDialogData>(CharterVersionsDialog, {
      data: { versions },
      maxWidth: '95vw',
    });
  }

  protected print(): void {
    window.print();
  }

  /** `sponsorId` → the sponsor field's label, and so on, for the "missing" list. */
  protected missingKey(field: string): string {
    return `charter.fields.${field === 'sponsorId' ? 'sponsor' : field}`;
  }
}
