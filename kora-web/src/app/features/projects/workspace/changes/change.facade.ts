import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, firstValueFrom } from 'rxjs';
import { ApprovalStep, ChangeRequest, Decision, Issue } from '../../../../core/api/api.models';
import { ChangeRequestsApi } from '../../../../core/api/change-requests.api';
import { ApprovalsInbox } from '../../../../core/approvals/approvals-inbox';
import { Notifier } from '../../../../core/notify/notifier';
import { OrgDirectory } from '../../../../core/people/org-directory';
import { SessionStore } from '../../../../core/session/session.store';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ProjectStore } from '../project.store';
import {
  ChangeRequestDialog,
  ChangeRequestDialogData,
  DecisionDialog,
  DecisionDialogData,
} from './change-dialogs';

/** The step waiting for a decision, if any. */
export function pendingStep(request: ChangeRequest): ApprovalStep | undefined {
  return request.steps.find((s) => s.state === 'PENDING');
}

/**
 * Change-request commands (feature 14), provided by the changes tab, the request page and the
 * issues tab (an issue can raise a request): drafting, editing, submitting, deciding,
 * withdrawing, implementing and revising, with the caller's rights. The UI mirrors who may
 * decide only to offer the buttons; the API enforces it (no self-approval, one approver per step).
 */
@Injectable()
export class ChangeFacade {
  private readonly api = inject(ChangeRequestsApi);
  private readonly project = inject(ProjectStore);
  private readonly session = inject(SessionStore);
  private readonly directory = inject(OrgDirectory);
  private readonly inbox = inject(ApprovalsInbox);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifier = inject(Notifier);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Bumped after every write; readers include it in their resource params. */
  readonly version = signal(0);
  /** Managers and contributors draft requests. */
  readonly canDraft = computed(() => this.project.canContribute());

  /** The requester or the project's managers edit, submit, withdraw and revise. */
  canEdit(request: ChangeRequest): boolean {
    return request.requestedBy.userId === this.project.myUserId() || this.project.canEdit();
  }

  canImplement(request: ChangeRequest): boolean {
    return request.status === 'APPROVED' && this.project.canEdit();
  }

  /** Whether the current step waits for me (never my own request). */
  awaitsMe(request: ChangeRequest): boolean {
    const me = this.project.myUserId();
    const role = this.session.activeRole();
    const step = pendingStep(request);
    if (!step || !me || request.requestedBy.userId === me) return false;
    if (step.approver) return step.approver.userId === me;
    return role === step.approverRole || (step.approverRole === 'PMO' && role === 'ORG_ADMIN');
  }

  async draft(issue?: Issue): Promise<ChangeRequest | undefined> {
    const projectId = this.project.projectId() ?? '';
    const created = await this.open<ChangeRequestDialogData, ChangeRequest>(ChangeRequestDialog, {
      ...(issue ? { issueKey: issue.key } : {}),
      currency: this.currency(),
      save: (body) =>
        firstValueFrom(
          this.api.create(projectId, { ...body, ...(issue ? { issueId: issue.id } : {}) }),
        ),
    });
    if (!created) return undefined;
    this.done('changes.drafted', created);
    await this.router.navigate(['/projects', created.projectId, 'change-requests', created.id]);
    return created;
  }

  async edit(request: ChangeRequest): Promise<ChangeRequest | undefined> {
    const saved = await this.open<ChangeRequestDialogData, ChangeRequest>(ChangeRequestDialog, {
      request,
      currency: this.currency(),
      save: (body) => firstValueFrom(this.api.update(request.id, body, request.version)),
    });
    if (saved) this.done('changes.saved', saved);
    return saved;
  }

  async submit(request: ChangeRequest): Promise<boolean> {
    if (
      !(await this.confirm(
        'changes.submitTitle',
        'changes.submitMessage',
        'changes.submit',
        request,
      ))
    ) {
      return false;
    }
    return this.run(this.api.submit(request.id), 'changes.submitted', request);
  }

  async decide(request: ChangeRequest, decision: Decision): Promise<boolean> {
    const decided = await this.open<DecisionDialogData, ChangeRequest>(DecisionDialog, {
      request,
      decision,
      reason: pendingStep(request)?.reason ?? '',
      decide: (body) => firstValueFrom(this.api.decide(request.id, body)),
    });
    if (!decided) return false;
    this.done(decision === 'APPROVE' ? 'changes.approved' : 'changes.rejected', decided);
    return true;
  }

  async withdraw(request: ChangeRequest): Promise<boolean> {
    if (
      !(await this.confirm(
        'changes.withdrawTitle',
        'changes.withdrawMessage',
        'changes.withdraw',
        request,
        true,
      ))
    ) {
      return false;
    }
    return this.run(this.api.withdraw(request.id), 'changes.withdrawn', request);
  }

  async implement(request: ChangeRequest): Promise<boolean> {
    if (
      !(await this.confirm(
        'changes.implementTitle',
        'changes.implementMessage',
        'changes.implement',
        request,
      ))
    ) {
      return false;
    }
    return this.run(this.api.implement(request.id), 'changes.implemented', request);
  }

  /** A new draft revision; opens it. */
  async revise(request: ChangeRequest): Promise<void> {
    try {
      const draft = await firstValueFrom(this.api.revise(request.id));
      this.done('changes.revised', draft);
      await this.router.navigate(['/projects', draft.projectId, 'change-requests', draft.id]);
    } catch {
      // Toasted by the error interceptor.
    }
  }

  private async run(
    call: Observable<ChangeRequest>,
    message: string,
    request: ChangeRequest,
  ): Promise<boolean> {
    try {
      await firstValueFrom(call);
      this.done(message, request);
      return true;
    } catch {
      // Toasted by the error interceptor.
      return false;
    }
  }

  private done(message: string, request: Pick<ChangeRequest, 'key'>): void {
    this.version.update((v) => v + 1);
    void this.inbox.refresh();
    this.notifier.success(this.transloco.translate(message, { key: request.key }));
  }

  private confirm(
    title: string,
    message: string,
    confirmLabel: string,
    request: ChangeRequest,
    destructive = false,
  ): Promise<boolean> {
    const t = (key: string) => this.transloco.translate(key, { key: request.key });
    return firstValueFrom(
      this.confirmDialog.confirm({
        title: t(title),
        message: t(message),
        confirmLabel: t(confirmLabel),
        destructive,
      }),
    );
  }

  private currency(): string {
    return this.directory.currency() ?? this.project.project()?.budget?.currency ?? 'RWF';
  }

  private open<D, R>(component: Parameters<MatDialog['open']>[0], data: D): Promise<R | undefined> {
    return firstValueFrom(
      this.dialog.open<unknown, D, R>(component, { data, injector: this.injector }).afterClosed(),
    );
  }
}
