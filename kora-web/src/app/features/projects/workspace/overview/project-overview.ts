import { Component, computed, inject, resource } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatFormField } from '@angular/material/form-field';
import { MatTooltip } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ProjectMember, ProjectStatus } from '../../../../core/api/api.models';
import { PortfoliosApi } from '../../../../core/api/portfolios.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { MoneyPipe } from '../../../../shared/format/money';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog';
import { ErrorState } from '../../../../shared/ui/error-state';
import { HealthChip, PROJECT_STATUS_LOOK } from '../../../../shared/ui/health-chip';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import {
  HealthDialog,
  HealthDialogData,
  MemberDialog,
  MemberDialogData,
  TransitionDialog,
  TransitionDialogData,
} from './project-dialogs';

/**
 * Overview tab: the project's facts, its lifecycle (only the moves the API allows are offered),
 * health with the manager's override, and the team. Editing is for the manager, PMO and admins.
 */
@Component({
  selector: 'kora-project-overview',
  imports: [
    ErrorState,
    HealthChip,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatOption,
    MatSelect,
    MatTooltip,
    MoneyPipe,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    @if (store.project(); as project) {
      <div class="grid">
        <section class="card details" aria-labelledby="details-title">
          <div class="card-head">
            <h2 id="details-title">{{ 'workspace.overview.details' | transloco }}</h2>
            @if (store.canEdit()) {
              <a mat-button [routerLink]="['/projects', project.id, 'edit']">
                <mat-icon svgIcon="edit" aria-hidden="true" />
                {{ 'common.edit' | transloco }}
              </a>
            }
          </div>
          @if (project.description) {
            <p class="description">{{ project.description }}</p>
          }
          <dl>
            <div>
              <dt>{{ 'projects.fields.portfolio' | transloco }}</dt>
              <dd>
                @if (portfolio.hasValue()) {
                  <a [routerLink]="['/portfolios', project.portfolioId]">{{
                    portfolio.value().name
                  }}</a>
                  @if (programName(); as program) {
                    <span class="kora-muted"> · {{ program }}</span>
                  }
                } @else {
                  —
                }
              </dd>
            </div>
            <div>
              <dt>{{ 'projects.fields.manager' | transloco }}</dt>
              <dd>{{ project.manager.fullName }}</dd>
            </div>
            <div>
              <dt>{{ 'projects.fields.methodology' | transloco }}</dt>
              <dd>{{ 'methodology.' + project.methodology + '.name' | transloco }}</dd>
            </div>
            <div>
              <dt>{{ 'projects.fields.startDate' | transloco }}</dt>
              <dd>{{ project.startDate | localizedDate: language.current() }}</dd>
            </div>
            <div>
              <dt>{{ 'projects.fields.targetEndDate' | transloco }}</dt>
              <dd>{{ project.targetEndDate | localizedDate: language.current() }}</dd>
            </div>
            <div>
              <dt>{{ 'projects.fields.budget' | transloco }}</dt>
              <dd>{{ (project.budget | money: language.current()) || '—' }}</dd>
            </div>
          </dl>
        </section>

        <section class="card" aria-labelledby="lifecycle-title">
          <h2 id="lifecycle-title">{{ 'workspace.lifecycle.title' | transloco }}</h2>
          <p>
            {{ 'workspace.lifecycle.current' | transloco }}
            <strong>{{ 'projectStatus.' + project.status | transloco }}</strong>
          </p>
          @if (project.status === 'PROPOSED') {
            <p class="kora-muted">
              {{ 'workspace.lifecycle.needsCharter' | transloco }}
              <a routerLink="../charter">{{ 'workspace.tabs.charter' | transloco }}</a>
            </p>
          }
          @if (project.allowedTransitions.length === 0) {
            <p class="kora-muted">{{ 'workspace.lifecycle.final' | transloco }}</p>
          } @else if (store.canEdit()) {
            <div class="actions">
              @for (to of project.allowedTransitions; track to) {
                <button mat-stroked-button type="button" (click)="transition(to)">
                  <mat-icon [svgIcon]="statusLook[to].icon" aria-hidden="true" />
                  {{
                    'workspace.lifecycle.moveTo'
                      | transloco: { status: ('projectStatus.' + to | transloco) }
                  }}
                </button>
              }
            </div>
          }
        </section>

        <section class="card" aria-labelledby="health-title">
          <h2 id="health-title">{{ 'projects.fields.health' | transloco }}</h2>
          <kora-health-chip
            [health]="project.health"
            [overridden]="project.healthOverridden"
            [reason]="project.healthReason"
            [showReason]="true"
          />
          @if (store.canEdit()) {
            <div class="actions">
              <button mat-stroked-button type="button" (click)="overrideHealth()">
                <mat-icon svgIcon="edit" aria-hidden="true" />
                {{ 'workspace.health.override' | transloco }}
              </button>
              @if (project.healthOverridden) {
                <button mat-button type="button" (click)="store.clearHealthOverride()">
                  {{ 'workspace.health.clear' | transloco }}
                </button>
              }
            </div>
          }
        </section>

        <section class="card team" aria-labelledby="team-title">
          <div class="card-head">
            <h2 id="team-title">{{ 'workspace.team.title' | transloco }}</h2>
            @if (store.canEdit() && store.members()) {
              <button mat-button type="button" (click)="addMember()">
                <mat-icon svgIcon="person_add" aria-hidden="true" />
                {{ 'workspace.team.add' | transloco }}
              </button>
            }
          </div>
          @if (store.membersError()) {
            <kora-error-state
              [correlationId]="store.membersError()?.correlationId"
              (retry)="store.reloadMembers()"
            />
          } @else if (store.members(); as members) {
            <ul class="members">
              @for (member of members; track member.userId) {
                <li>
                  <span class="person">
                    <span class="name">{{ member.fullName }}</span>
                    <span class="kora-muted email">{{ member.email }}</span>
                  </span>
                  @if (store.canEdit() && member.projectRole !== 'MANAGER') {
                    <mat-form-field class="role-select" subscriptSizing="dynamic">
                      <mat-select
                        [value]="member.projectRole"
                        [aria-label]="
                          'workspace.team.changeRole' | transloco: { name: member.fullName }
                        "
                        (selectionChange)="store.putMember(member.userId, $event.value)"
                      >
                        <mat-option value="CONTRIBUTOR">{{
                          'projectRole.CONTRIBUTOR' | transloco
                        }}</mat-option>
                        <mat-option value="OBSERVER">{{
                          'projectRole.OBSERVER' | transloco
                        }}</mat-option>
                      </mat-select>
                    </mat-form-field>
                    <button
                      mat-icon-button
                      type="button"
                      [attr.aria-label]="
                        'workspace.team.remove' | transloco: { name: member.fullName }
                      "
                      [matTooltip]="'workspace.team.remove' | transloco: { name: member.fullName }"
                      (click)="removeMember(member)"
                    >
                      <mat-icon svgIcon="delete" aria-hidden="true" />
                    </button>
                  } @else {
                    <span class="role">{{ 'projectRole.' + member.projectRole | transloco }}</span>
                  }
                </li>
              }
            </ul>
          } @else {
            <kora-loading-state />
          }
        </section>
      </div>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
      gap: var(--kora-space-4);
      align-items: start;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--kora-space-3);
      padding: var(--kora-space-4);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--kora-radius);
    }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--kora-space-2);
    }
    h2 {
      font: var(--mat-sys-title-medium);
    }
    p {
      margin: 0;
    }
    .description {
      white-space: pre-line;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--kora-space-3);
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
    }
    .members {
      display: grid;
      gap: var(--kora-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .members li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--kora-space-2);
    }
    .person {
      display: flex;
      flex: 1 1 160px;
      flex-direction: column;
      min-inline-size: 0;
    }
    .email {
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .role-select {
      inline-size: 150px;
      --mat-form-field-container-vertical-padding: 8px;
      --mat-form-field-container-height: 40px;
    }
    .role {
      font: var(--mat-sys-label-large);
    }
  `,
})
export class ProjectOverview {
  protected readonly store = inject(ProjectStore);
  protected readonly language = inject(LanguageService);
  private readonly portfoliosApi = inject(PortfoliosApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly transloco = inject(TranslocoService);

  protected readonly statusLook = PROJECT_STATUS_LOOK;

  protected readonly portfolio = resource({
    params: () => this.store.project()?.portfolioId,
    loader: ({ params }) => firstValueFrom(this.portfoliosApi.get(params)),
  });
  private readonly programs = resource({
    params: () => (this.store.project()?.programId ? this.store.project()?.portfolioId : undefined),
    loader: ({ params }) => firstValueFrom(this.portfoliosApi.listPrograms(params)),
  });
  protected readonly programName = computed(() => {
    const programId = this.store.project()?.programId;
    return this.programs.hasValue()
      ? this.programs.value().find((p) => p.id === programId)?.name
      : undefined;
  });

  protected transition(to: ProjectStatus): void {
    const project = this.store.project();
    if (!project) return;
    this.dialog.open<TransitionDialog, TransitionDialogData>(TransitionDialog, {
      data: {
        to,
        projectName: project.name,
        transition: (target, reason) => this.store.transition(target, reason),
      },
    });
  }

  protected overrideHealth(): void {
    const project = this.store.project();
    if (!project) return;
    this.dialog.open<HealthDialog, HealthDialogData>(HealthDialog, {
      data: {
        current: project.health,
        override: (health, reason) => this.store.overrideHealth({ health, reason }),
      },
    });
  }

  protected addMember(): void {
    this.dialog.open<MemberDialog, MemberDialogData>(MemberDialog, {
      data: {
        team: this.store.members() ?? [],
        add: (userId, projectRole) => this.store.putMember(userId, projectRole),
      },
    });
  }

  protected removeMember(member: ProjectMember): void {
    const t = (key: string) => this.transloco.translate(key, { name: member.fullName });
    this.confirmDialog
      .confirm({
        title: t('workspace.team.removeTitle'),
        message: t('workspace.team.removeMessage'),
        confirmLabel: t('workspace.team.removeConfirm'),
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) void this.store.removeMember(member);
      });
  }
}
