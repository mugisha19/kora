import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Issue } from '../../../../core/api/api.models';
import { toApiError } from '../../../../core/api/api-error';
import { IssuesApi } from '../../../../core/api/issues.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { ChangeFacade } from '../changes/change.facade';
import { ISSUE_STATUS_LOOK } from '../governance-look';
import { routeSheet } from '../route-sheet';
import { PriorityChip } from '../work/task-look';
import { IssueFacade, isUnresolved } from './issue.facade';

export interface IssueSheetData {
  issueId: string;
}

/**
 * One issue in a side sheet (feature 12): what is wrong, who resolves it by when, its resolution,
 * the risk it came from and the change request raised for it. Its owner and the project's
 * managers move it through OPEN ⇄ IN_PROGRESS → RESOLVED → CLOSED.
 */
@Component({
  selector: 'kora-issue-sheet',
  imports: [
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    PriorityChip,
    RouterLink,
    StatusChip,
    TranslocoPipe,
  ],
  template: `
    <div class="head">
      <h2 mat-dialog-title>
        @if (issue.value(); as i) {
          <span class="key">{{ i.key }}</span>
          {{ i.title }}
        } @else {
          {{ 'issues.sheetTitle' | transloco }}
        }
      </h2>
      <button mat-button type="button" class="close" (click)="close()">
        <mat-icon svgIcon="close" aria-hidden="true" />
        {{ 'common.close' | transloco }}
      </button>
    </div>

    <mat-dialog-content tabindex="0">
      @if (notFound()) {
        <p>{{ 'issues.notFound' | transloco }}</p>
      } @else if (issue.error()) {
        <kora-error-state (retry)="issue.reload()" />
      } @else if (issue.value(); as i) {
        <div class="chips">
          <kora-priority-chip [priority]="i.priority" />
          <kora-status-chip
            [tone]="statusLook[i.status].tone"
            [icon]="statusLook[i.status].icon"
            [label]="'issueStatus.' + i.status | transloco"
          />
          @if (i.overdue) {
            <kora-status-chip
              tone="warning"
              icon="warning"
              [label]="'issues.overdue' | transloco"
            />
          }
          @if (i.escalated) {
            <kora-status-chip
              tone="danger"
              icon="keyboard_double_arrow_up"
              [label]="'issues.escalated' | transloco"
            />
          }
        </div>
        @if (i.escalated) {
          <p class="kora-muted">{{ 'issues.escalatedHelp' | transloco }}</p>
        }

        <dl class="facts">
          <div>
            <dt>{{ 'issues.fields.type' | transloco }}</dt>
            <dd>{{ 'issueType.' + i.type | transloco }}</dd>
          </div>
          <div>
            <dt>{{ 'issues.fields.owner' | transloco }}</dt>
            <dd>{{ i.owner?.fullName ?? ('risks.noOwner' | transloco) }}</dd>
          </div>
          <div>
            <dt>{{ 'issues.fields.dueDate' | transloco }}</dt>
            <dd>{{ (i.dueDate | localizedDate: language.current()) || '—' }}</dd>
          </div>
          <div>
            <dt>{{ 'issues.fields.raisedBy' | transloco }}</dt>
            <dd>
              {{ i.raisedBy.fullName }}, {{ i.createdAt | localizedDate: language.current() }}
            </dd>
          </div>
        </dl>

        @if (i.description) {
          <h3>{{ 'issues.fields.description' | transloco }}</h3>
          <p class="text">{{ i.description }}</p>
        }
        @if (i.resolution) {
          <h3>{{ 'issues.resolution' | transloco }}</h3>
          <p class="text">{{ i.resolution }}</p>
          @if (i.resolvedAt) {
            <p class="kora-muted">
              {{
                'issues.resolvedOn'
                  | transloco: { date: (i.resolvedAt | localizedDate: language.current()) }
              }}
            </p>
          }
        }

        @if (i.riskId || i.changeRequestId) {
          <h3>{{ 'issues.links' | transloco }}</h3>
          <ul class="links">
            @if (i.riskId) {
              <li>
                <a [routerLink]="['/projects', i.projectId, 'risks', i.riskId]">
                  {{ 'issues.fromRisk' | transloco }}
                </a>
              </li>
            }
            @if (i.changeRequestId) {
              <li>
                <a [routerLink]="['/projects', i.projectId, 'change-requests', i.changeRequestId]">
                  {{ 'issues.changeRequest' | transloco }}
                </a>
              </li>
            }
          </ul>
        }
      } @else {
        <kora-loading-state />
      }
    </mat-dialog-content>

    @if (issue.value(); as i) {
      @if (actions(i); as a) {
        @if (a.any) {
          <mat-dialog-actions align="end">
            @if (a.raiseChange) {
              <button mat-button type="button" (click)="changes.draft(i)">
                <mat-icon svgIcon="swap_horiz" aria-hidden="true" />
                {{ 'issues.raiseChange' | transloco }}
              </button>
            }
            @if (a.reopen) {
              <button mat-button type="button" (click)="facade.reopen(i)">
                <mat-icon svgIcon="undo" aria-hidden="true" />
                {{ 'issues.reopen' | transloco }}
              </button>
            }
            @if (a.close) {
              <button mat-flat-button type="button" (click)="facade.close(i)">
                <mat-icon svgIcon="check" aria-hidden="true" />
                {{ 'issues.close' | transloco }}
              </button>
            }
            @if (a.work) {
              @if (i.status === 'OPEN') {
                <button mat-button type="button" (click)="facade.setStatus(i, 'IN_PROGRESS')">
                  {{ 'issues.start' | transloco }}
                </button>
              } @else {
                <button mat-button type="button" (click)="facade.setStatus(i, 'OPEN')">
                  {{ 'issues.pause' | transloco }}
                </button>
              }
              <button mat-stroked-button type="button" (click)="facade.edit(i)">
                <mat-icon svgIcon="edit" aria-hidden="true" />
                {{ 'common.edit' | transloco }}
              </button>
              <button mat-flat-button type="button" (click)="facade.resolve(i)">
                <mat-icon svgIcon="check_circle" aria-hidden="true" />
                {{ 'issues.resolve' | transloco }}
              </button>
            }
          </mat-dialog-actions>
        }
      }
    }
  `,
  styleUrl: '../risks/risk-sheet.scss',
})
export class IssueSheet {
  protected readonly data = inject<IssueSheetData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<IssueSheet>);
  private readonly api = inject(IssuesApi);
  protected readonly facade = inject(IssueFacade);
  protected readonly changes = inject(ChangeFacade);
  protected readonly language = inject(LanguageService);
  protected readonly statusLook = ISSUE_STATUS_LOOK;

  protected readonly issue = resource({
    params: () => ({
      id: this.data.issueId,
      version: this.facade.version() + this.changes.version(),
    }),
    loader: ({ params }) => firstValueFrom(this.api.get(params.id)),
  });
  protected readonly notFound = computed(() => {
    const error = this.issue.error();
    return !!error && toApiError(error).status === 404;
  });

  /** What the caller may do with the issue now. */
  protected actions(issue: Issue) {
    const unresolved = isUnresolved(issue);
    const work = unresolved && this.facade.canWork(issue);
    const reopen = !unresolved && this.facade.isManager();
    const close = issue.status === 'RESOLVED' && this.facade.isManager();
    const raiseChange = unresolved && !issue.changeRequestId && this.changes.canDraft();
    return { work, reopen, close, raiseChange, any: work || reopen || close || raiseChange };
  }

  protected close(): void {
    this.dialogRef.close();
  }
}

/** `/projects/:id/issues/:issueId`: the issue's sheet over the log (notification links land here). */
@Component({ selector: 'kora-issue-sheet-route', template: '' })
export class IssueSheetRoute {
  /** Route parameter. */
  readonly issueId = input.required<string>();

  constructor() {
    routeSheet<IssueSheet, IssueSheetData>(IssueSheet, this.issueId, (issueId) => ({ issueId }));
  }
}
