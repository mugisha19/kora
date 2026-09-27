import { Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApprovalStep } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';

const STATE_ICON: Record<ApprovalStep['state'], string> = {
  APPROVED: 'check_circle',
  REJECTED: 'cancel',
  PENDING: 'schedule',
  WAITING: 'more_vert',
  SKIPPED: 'do_not_disturb_on',
};

/**
 * The approval chain as a vertical timeline (feature 14): each step's level, who decides and why
 * the step is there, its state in words (with an icon of its own shape), and the decision.
 */
@Component({
  selector: 'kora-approval-timeline',
  imports: [LocalizedDatePipe, MatIcon, TranslocoPipe],
  template: `
    <ol>
      @for (step of steps(); track step.position) {
        <li [class]="'state-' + step.state.toLowerCase()">
          <span class="marker" aria-hidden="true">
            <mat-icon [svgIcon]="icons[step.state]" />
          </span>
          <div class="body">
            <p class="title">
              <strong>{{ 'approvalLevel.' + step.level | transloco }}</strong>
              <span class="state">{{ 'stepState.' + step.state | transloco }}</span>
            </p>
            <p class="who">
              @if (step.approver) {
                {{ step.approver.fullName }}
              } @else if (step.approverRole) {
                {{
                  'changes.anyRole'
                    | transloco: { role: ('roles.' + step.approverRole | transloco) }
                }}
              }
            </p>
            <p class="reason">{{ step.reason }}</p>
            @if (step.decidedBy) {
              <p class="decision">
                {{
                  'changes.decidedBy'
                    | transloco
                      : {
                          name: step.decidedBy.fullName,
                          date: (step.decidedAt | localizedDate: language.current()),
                        }
                }}
                @if (step.comment) {
                  <q>{{ step.comment }}</q>
                }
              </p>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      position: relative;
      display: grid;
      grid-template-columns: 32px 1fr;
      gap: var(--kora-space-3);
      padding-block-end: var(--kora-space-4);
    }
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      inset-block: 32px 0;
      inset-inline-start: 15px;
      border-inline-start: 2px solid var(--mat-sys-outline-variant);
    }
    .marker {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 50%;
      color: var(--kora-neutral-fg);
      background: var(--kora-neutral-bg);
    }
    .state-approved .marker {
      color: var(--kora-success-fg);
      background: var(--kora-success-bg);
    }
    .state-rejected .marker {
      color: var(--kora-danger-fg);
      background: var(--kora-danger-bg);
    }
    .state-pending .marker {
      color: var(--kora-info-fg);
      background: var(--kora-info-bg);
      outline: 2px solid var(--kora-info-fg);
    }
    mat-icon {
      inline-size: 20px;
      block-size: 20px;
    }
    p {
      margin: 0;
    }
    .title {
      display: flex;
      flex-wrap: wrap;
      gap: var(--kora-space-2);
      align-items: baseline;
    }
    .state {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
    }
    .reason,
    .decision {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    q {
      display: block;
      margin-block-start: var(--kora-space-1);
      color: var(--mat-sys-on-surface);
      font-style: italic;
    }
  `,
})
export class ApprovalTimeline {
  readonly steps = input.required<readonly ApprovalStep[]>();
  protected readonly icons = STATE_ICON;
  protected readonly language = inject(LanguageService);
}
