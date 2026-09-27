import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import { Issue } from '../../../../core/api/api.models';
import { IssuesApi } from '../../../../core/api/issues.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { Notifier } from '../../../../core/notify/notifier';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ProjectStore } from '../project.store';
import { ReasonDialog, ReasonDialogData } from '../work/reason-dialog';
import { IssueDialog, IssueDialogData } from './issue-dialogs';

/** Unresolved issues can be edited, started, resolved. */
export function isUnresolved(issue: Issue): boolean {
  return issue.status === 'OPEN' || issue.status === 'IN_PROGRESS';
}

/**
 * Issue commands for the log and the issue sheet (feature 12), provided by the issues tab: raise,
 * edit, start or pause work, resolve (a resolution is required), close and reopen (managers).
 * `version` moves after every change so the log reloads.
 */
@Injectable()
export class IssueFacade {
  private readonly api = inject(IssuesApi);
  private readonly project = inject(ProjectStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifier = inject(Notifier);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);
  private readonly injector = inject(Injector);

  readonly version = signal(0);
  /** Managers and contributors raise issues. */
  readonly canRaise = computed(() => this.project.canContribute());
  readonly isManager = computed(() => this.project.canEdit());

  /** The project's managers or the issue's owner work on it. */
  canWork(issue: Issue): boolean {
    return this.project.canEdit() || issue.owner?.userId === this.project.myUserId();
  }

  async raise(): Promise<Issue | undefined> {
    const projectId = this.project.projectId() ?? '';
    const created = await this.open<IssueDialogData, Issue>(IssueDialog, {
      members: this.project.members() ?? [],
      save: (body) => firstValueFrom(this.api.create(projectId, body)),
    });
    if (created) this.done('issues.raised', created);
    return created;
  }

  async edit(issue: Issue): Promise<Issue | undefined> {
    const saved = await this.open<IssueDialogData, Issue>(IssueDialog, {
      issue,
      members: this.project.members() ?? [],
      save: (body) => firstValueFrom(this.api.update(issue.id, body, issue.version)),
    });
    if (saved) this.done('issues.saved', saved);
    return saved;
  }

  /** OPEN ⇄ IN_PROGRESS. */
  setStatus(issue: Issue, status: 'OPEN' | 'IN_PROGRESS'): Promise<boolean> {
    return this.run(
      this.api.update(issue.id, { status }, issue.version),
      status === 'IN_PROGRESS' ? 'issues.started' : 'issues.paused',
      issue,
    );
  }

  async resolve(issue: Issue): Promise<boolean> {
    const resolution = await this.ask(
      issue,
      'issues.resolveTitle',
      'issues.resolution',
      'issues.resolve',
      4000,
    );
    return resolution
      ? this.run(this.api.resolve(issue.id, resolution), 'issues.resolved', issue)
      : false;
  }

  async close(issue: Issue): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, { key: issue.key });
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: t('issues.closeTitle'),
        message: t('issues.closeMessage'),
        confirmLabel: t('issues.close'),
      }),
    );
    return confirmed ? this.run(this.api.close(issue.id), 'issues.closed', issue) : false;
  }

  async reopen(issue: Issue): Promise<boolean> {
    const reason = await this.ask(
      issue,
      'issues.reopenTitle',
      'issues.reopenReason',
      'issues.reopen',
      1000,
    );
    return reason ? this.run(this.api.reopen(issue.id, reason), 'issues.reopened', issue) : false;
  }

  private ask(
    issue: Issue,
    title: string,
    label: string,
    confirm: string,
    maxLength: number,
  ): Promise<string | undefined> {
    const t = (key: string) => this.transloco.translate(key, { key: issue.key });
    return this.open<ReasonDialogData, string>(ReasonDialog, {
      title: t(title),
      label: t(label),
      confirm: t(confirm),
      maxLength,
    });
  }

  private async run(call: Observable<Issue>, message: string, issue: Issue): Promise<boolean> {
    try {
      await firstValueFrom(call);
      this.done(message, issue);
      return true;
    } catch (error: unknown) {
      // Form writes are silent in the interceptor; say what went wrong here.
      const apiError = toApiError(error);
      this.notifier.error(this.messages.message(apiError), apiError.correlationId);
      return false;
    }
  }

  private done(message: string, issue: Pick<Issue, 'key'>): void {
    this.version.update((v) => v + 1);
    this.notifier.success(this.transloco.translate(message, { key: issue.key }));
  }

  private open<D, R>(component: Parameters<MatDialog['open']>[0], data: D): Promise<R | undefined> {
    return firstValueFrom(
      this.dialog.open<unknown, D, R>(component, { data, injector: this.injector }).afterClosed(),
    );
  }
}
