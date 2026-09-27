import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChangeRequest } from '../../core/api/api.models';
import { ApprovalsInbox } from '../../core/approvals/approvals-inbox';
import { LanguageService } from '../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../shared/forms/localized-date.pipe';
import { EmptyState } from '../../shared/ui/empty-state';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';

/**
 * `/approvals` (feature 14): change requests across the organization's projects waiting for the
 * signed-in person's decision, oldest submission first. Each links to its page, where the decision
 * is made with the full impact in view.
 */
@Component({
  selector: 'kora-approvals-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    PageHeader,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <kora-page-header
      [heading]="'approvals.title' | transloco"
      [subtitle]="'approvals.subtitle' | transloco"
    />

    @if (inbox.requests(); as requests) {
      @if (requests.length) {
        <p class="count" role="status">
          {{ 'approvals.count' | transloco: { count: requests.length } }}
        </p>
        <ul class="requests">
          @for (request of requests; track request.id) {
            <li>
              <a [routerLink]="['/projects', request.projectId, 'change-requests', request.id]">
                <span class="key">{{ request.key }}</span
                >&ngsp;<span>{{ request.title }}</span>
              </a>
              <p>
                <strong>{{ 'approvalLevel.' + step(request)?.level | transloco }}</strong>
                — {{ step(request)?.reason }}
              </p>
              <p class="kora-muted">
                {{
                  'approvals.requested'
                    | transloco
                      : {
                          name: request.requestedBy.fullName,
                          date: (request.submittedAt | localizedDate: language.current()),
                        }
                }}
              </p>
            </li>
          }
        </ul>
      } @else {
        <kora-empty-state
          icon="approval"
          [heading]="'approvals.emptyTitle' | transloco"
          [message]="'approvals.emptyMessage' | transloco"
        />
      }
    } @else if (inbox.error()) {
      <kora-error-state (retry)="inbox.refresh()" />
    } @else {
      <kora-loading-state />
    }
  `,
  styles: `
    .count {
      color: var(--mat-sys-on-surface-variant);
    }
    .requests {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      padding: var(--kora-space-3) 0;
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }
    li a {
      font: var(--mat-sys-title-small);
    }
    li p {
      margin: var(--kora-space-1) 0 0;
    }
    .key {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ApprovalsPage {
  protected readonly inbox = inject(ApprovalsInbox);
  protected readonly language = inject(LanguageService);

  constructor() {
    void this.inbox.refresh();
  }

  protected step(request: ChangeRequest) {
    return request.steps.find((s) => s.state === 'PENDING');
  }
}
