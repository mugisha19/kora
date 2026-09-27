import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Stakeholder } from '../../../../core/api/api.models';
import { StakeholdersApi } from '../../../../core/api/stakeholders.api';
import { Notifier } from '../../../../core/notify/notifier';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ProjectStore } from '../project.store';
import { StakeholderDialog, StakeholderDialogData } from './stakeholder-dialog';

/**
 * Stakeholder commands (feature 13), provided by the stakeholders tab: managers add, edit and
 * remove (removal anonymizes: the name is replaced and personal data erased); everyone else
 * opens a read-only view. `version` moves after every change.
 */
@Injectable()
export class StakeholderFacade {
  private readonly api = inject(StakeholdersApi);
  private readonly project = inject(ProjectStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);

  readonly version = signal(0);
  /** The project manager, PMO and ORG_ADMIN maintain the register. */
  readonly canEdit = computed(() => this.project.canEdit());

  add(): Promise<unknown> {
    const projectId = this.project.projectId() ?? '';
    return this.open(
      {
        canEdit: true,
        save: (body) => firstValueFrom(this.api.create(projectId, body)),
      },
      'stakeholders.added',
    );
  }

  /** Edits for managers, a read-only view for everyone else. */
  async show(id: string): Promise<void> {
    let stakeholder: Stakeholder;
    try {
      stakeholder = await firstValueFrom(this.api.get(id));
    } catch {
      return; // Toasted by the error interceptor.
    }
    await this.open(
      {
        stakeholder,
        canEdit: this.canEdit(),
        save: (body) => firstValueFrom(this.api.update(id, body, stakeholder.version)),
        remove: (s) => this.remove(s),
      },
      'stakeholders.saved',
    );
  }

  private async remove(stakeholder: Stakeholder): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, { name: stakeholder.name });
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t('stakeholders.removeTitle'),
        message: t('stakeholders.removeMessage'),
        confirmLabel: t('stakeholders.remove'),
        destructive: true,
      }),
    );
    if (!confirmed) return false;
    try {
      await firstValueFrom(this.api.remove(stakeholder.id));
    } catch {
      return false;
    }
    this.version.update((v) => v + 1);
    this.notifier.success(t('stakeholders.removed'));
    return true;
  }

  private async open(data: StakeholderDialogData, message: string): Promise<unknown> {
    const result = await firstValueFrom(
      this.dialog
        .open<StakeholderDialog, StakeholderDialogData, Stakeholder | 'removed'>(
          StakeholderDialog,
          { data, injector: this.injector },
        )
        .afterClosed(),
    );
    if (result && result !== 'removed') {
      this.version.update((v) => v + 1);
      this.notifier.success(this.transloco.translate(message, { name: result.name }));
    }
    return result;
  }
}
