import { Component, computed, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatSort, MatSortHeader, Sort } from '@angular/material/sort';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  CreateInvitationRequest,
  INVITATION_STATUSES,
  Invitation,
  InvitationStatus,
} from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../shared/forms/localized-date.pipe';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { StatusChip, StatusTone } from '../../../shared/ui/status-chip';
import { InviteDialog, InviteDialogData } from './invite-dialog';
import { InvitationSortField, InvitationsStore } from './invitations.store';

/** Tone and icon per status: each status has its own shape, not only its own colour. */
export const INVITATION_STATUS_LOOK: Record<InvitationStatus, { tone: StatusTone; icon: string }> =
  {
    PENDING: { tone: 'info', icon: 'schedule' },
    ACCEPTED: { tone: 'success', icon: 'check_circle' },
    REVOKED: { tone: 'neutral', icon: 'block' },
    EXPIRED: { tone: 'warning', icon: 'warning' },
  };

/** Invitations tab: status filter (Pending by default), invite dialog, revoke with confirmation. */
@Component({
  selector: 'kora-invitations-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatFormField,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatIcon,
    MatIconButton,
    MatLabel,
    MatOption,
    MatPaginator,
    MatRow,
    MatRowDef,
    MatSelect,
    MatSort,
    MatSortHeader,
    MatTable,
    MatTooltip,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [InvitationsStore],
  templateUrl: './invitations-page.html',
  styleUrl: '../admin-tables.scss',
})
export class InvitationsPage {
  protected readonly store = inject(InvitationsStore);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = inject(LanguageService);

  protected readonly statuses = INVITATION_STATUSES;
  protected readonly columns = [
    'email',
    'role',
    'status',
    'invitedByName',
    'createdAt',
    'expiresAt',
    'actions',
  ];
  protected readonly firstLoad = computed(
    () => this.store.status() === 'loading' && this.store.result() === null,
  );

  protected lookOf(status: InvitationStatus): { tone: StatusTone; icon: string } {
    return INVITATION_STATUS_LOOK[status];
  }

  protected onSort(sort: Sort): void {
    this.store.sortBy(
      sort.active as InvitationSortField,
      sort.direction === 'asc' ? 'asc' : 'desc',
    );
  }

  protected onPage(event: PageEvent): void {
    this.store.setPage(event.pageIndex, event.pageSize);
  }

  protected openInvite(): void {
    this.dialog.open<InviteDialog, InviteDialogData, boolean>(InviteDialog, {
      data: { invite: (request: CreateInvitationRequest) => this.store.create(request) },
      maxWidth: 'min(520px, calc(100vw - 32px))',
    });
  }

  protected revoke(invitation: Invitation): void {
    const t = (key: string) => this.transloco.translate(key, { email: invitation.email });
    this.confirm
      .confirm({
        title: t('admin.invitations.revokeTitle'),
        message: t('admin.invitations.revokeMessage'),
        confirmLabel: t('admin.invitations.revokeConfirm'),
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) void this.store.revoke(invitation);
      });
  }
}
