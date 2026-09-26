import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatPrefix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
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
import { ROLES, Member, Role } from '../../../core/api/api.models';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { LocalizedDatePipe } from '../../../shared/forms/localized-date.pipe';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { StatusChip } from '../../../shared/ui/status-chip';
import { MemberSortField, MembersStore } from './members.store';

/**
 * Members tab: search, role filter, server-side sort and paging, inline role change and removal.
 * Your own row is read-only (you can't demote or remove yourself here; the API also refuses).
 */
@Component({
  selector: 'kora-members-page',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
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
    MatInput,
    MatLabel,
    MatOption,
    MatPaginator,
    MatPrefix,
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
  providers: [MembersStore],
  templateUrl: './members-page.html',
  styleUrl: '../admin-tables.scss',
})
export class MembersPage {
  protected readonly store = inject(MembersStore);
  private readonly session = inject(SessionStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = inject(LanguageService);

  protected readonly roles = ROLES;
  protected readonly columns = ['fullName', 'email', 'role', 'joinedAt', 'actions'];
  protected readonly myUserId = computed(() => this.session.user()?.id);
  /** The first load shows a placeholder; later loads keep the table and show the progress bar. */
  protected readonly firstLoad = computed(
    () => this.store.status() === 'loading' && this.store.result() === null,
  );

  protected isMe(member: Member): boolean {
    return member.userId === this.myUserId();
  }

  protected isBusy(member: Member): boolean {
    return this.store.busyIds().includes(member.id);
  }

  protected onSearch(event: Event): void {
    this.store.search((event.target as HTMLInputElement).value);
  }

  protected onSort(sort: Sort): void {
    this.store.sortBy(sort.active as MemberSortField, sort.direction === 'desc' ? 'desc' : 'asc');
  }

  protected onPage(event: PageEvent): void {
    this.store.setPage(event.pageIndex, event.pageSize);
  }

  protected changeRole(member: Member, role: Role): void {
    void this.store.changeRole(member, role);
  }

  protected remove(member: Member): void {
    const t = (key: string) =>
      this.transloco.translate(key, {
        name: member.fullName,
        organization: this.session.activeMembership()?.organizationName ?? '',
      });
    this.confirm
      .confirm({
        title: t('admin.members.removeTitle'),
        message: t('admin.members.removeMessage'),
        confirmLabel: t('admin.members.removeConfirm'),
        destructive: true,
      })
      .subscribe((confirmed) => {
        if (confirmed) void this.store.remove(member);
      });
  }
}
