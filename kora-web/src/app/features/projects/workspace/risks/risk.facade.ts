import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Issue, Risk } from '../../../../core/api/api.models';
import { toApiError } from '../../../../core/api/api-error';
import { RisksApi } from '../../../../core/api/risks.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { Notifier } from '../../../../core/notify/notifier';
import { ProjectStore } from '../project.store';
import { ReasonDialog, ReasonDialogData } from '../work/reason-dialog';
import {
  AssessDialog,
  AssessDialogData,
  MaterializeDialog,
  MaterializeDialogData,
  RiskDialog,
  RiskDialogData,
} from './risk-dialogs';

/**
 * Risk commands for the register and the risk sheet (feature 11), provided by the risks tab:
 * opens the dialogs with the caller's rights, calls the API and says what happened. `version`
 * moves after every change so the register and heat map reload.
 */
@Injectable()
export class RiskFacade {
  private readonly api = inject(RisksApi);
  private readonly project = inject(ProjectStore);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Bumped after every write; readers include it in their resource params. */
  readonly version = signal(0);
  /** Managers and contributors raise risks. */
  readonly canRaise = computed(() => this.project.canContribute());

  /** The project's managers or the risk's owner change it (closed risks are read-only). */
  canManage(risk: Risk): boolean {
    return (
      risk.status !== 'CLOSED' &&
      (this.project.canEdit() || risk.ownerId === this.project.myUserId())
    );
  }

  changed(): void {
    this.version.update((v) => v + 1);
  }

  async raise(): Promise<Risk | undefined> {
    const projectId = this.project.projectId() ?? '';
    const created = await this.open<RiskDialogData, Risk>(RiskDialog, {
      members: this.project.members() ?? [],
      save: (request) => firstValueFrom(this.api.create(projectId, request)),
    });
    if (created) this.done('risks.raised', created);
    return created;
  }

  async edit(risk: Risk): Promise<Risk | undefined> {
    const saved = await this.open<RiskDialogData, Risk>(RiskDialog, {
      risk,
      members: this.project.members() ?? [],
      save: (request) => firstValueFrom(this.api.update(risk.id, request, risk.version)),
    });
    if (saved) this.done('risks.saved', saved);
    return saved;
  }

  async assess(risk: Risk): Promise<boolean> {
    const assessed = await this.open<AssessDialogData, unknown>(AssessDialog, {
      risk,
      save: (request) => firstValueFrom(this.api.assess(risk.id, request)),
    });
    if (assessed) this.done('risks.assessed', risk);
    return !!assessed;
  }

  async close(risk: Risk): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, { key: risk.key });
    const note = await this.open<ReasonDialogData, string>(ReasonDialog, {
      title: t('risks.closeTitle'),
      label: t('risks.closeNote'),
      confirm: t('risks.close'),
    });
    if (!note) return false;
    try {
      await firstValueFrom(this.api.close(risk.id, note));
      this.done('risks.closedToast', risk);
      return true;
    } catch (error: unknown) {
      const apiError = toApiError(error);
      this.notifier.error(this.messages.message(apiError), apiError.correlationId);
      return false;
    }
  }

  /** Opens the linked issue once it exists. */
  async materialize(risk: Risk): Promise<Issue | undefined> {
    const issue = await this.open<MaterializeDialogData, Issue>(MaterializeDialog, {
      risk,
      members: this.project.members() ?? [],
      save: (request) => firstValueFrom(this.api.materialize(risk.id, request)),
    });
    if (!issue) return undefined;
    this.changed();
    this.notifier.success(
      this.transloco.translate('risks.materialized', { key: risk.key, issue: issue.key }),
    );
    await this.router.navigate(['/projects', risk.projectId, 'issues', issue.id]);
    return issue;
  }

  private done(message: string, risk: Pick<Risk, 'key'>): void {
    this.changed();
    this.notifier.success(this.transloco.translate(message, { key: risk.key }));
  }

  private open<D, R>(component: Parameters<MatDialog['open']>[0], data: D): Promise<R | undefined> {
    return firstValueFrom(
      this.dialog.open<unknown, D, R>(component, { data, injector: this.injector }).afterClosed(),
    );
  }
}
