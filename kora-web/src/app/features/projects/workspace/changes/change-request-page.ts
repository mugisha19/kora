import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import { ChangeRequestsApi } from '../../../../core/api/change-requests.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { ApprovalTimeline } from './approval-timeline';
import { ChangeFacade } from './change.facade';
import { ChangeStatusChip, SignedMoneyPipe, WaitingFor } from './change-look';
import { AttachmentsPanel } from '../attachments/attachments-panel';
import { HistorySection } from '../history/history-section';

/**
 * `/projects/:id/change-requests/:changeRequestId` (feature 14): the request, its impact, and the
 * approval timeline, with the actions its status and the caller's rights allow — edit and submit
 * a draft, approve or reject the step waiting for you, withdraw, implement, revise.
 */
@Component({
  selector: 'kora-change-request-page',
  imports: [
    AttachmentsPanel,
    HistorySection,
    ApprovalTimeline,
    ChangeStatusChip,
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatIcon,
    RouterLink,
    SignedMoneyPipe,
    TranslocoPipe,
    WaitingFor,
  ],
  providers: [ChangeFacade],
  templateUrl: './change-request-page.html',
  styleUrls: ['../governance-table.scss', './changes.scss'],
})
export class ChangeRequestPage {
  /** Route parameter. */
  readonly changeRequestId = input.required<string>();

  protected readonly facade = inject(ChangeFacade);
  protected readonly project = inject(ProjectStore);
  protected readonly language = inject(LanguageService);
  private readonly api = inject(ChangeRequestsApi);

  protected readonly request = resource({
    params: () => ({ id: this.changeRequestId(), version: this.facade.version() }),
    loader: ({ params }) => firstValueFrom(this.api.get(params.id)),
  });
  protected readonly notFound = computed(() => {
    const error = this.request.error();
    return !!error && toApiError(error).status === 404;
  });
}
