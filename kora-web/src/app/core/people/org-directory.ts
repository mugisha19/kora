import { Injectable, computed, inject, resource } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Member, Role } from '../api/api.models';
import { MembersApi } from '../api/members.api';
import { OrganizationApi } from '../api/organization.api';
import { SessionStore } from '../session/session.store';

/** Members fetched for pickers. Kora's organizations are small; a larger one would need search. */
const PEOPLE_LIMIT = 100;

/**
 * Who is in the active organization and which currency it uses, for pickers (manager, owner,
 * sponsor, team) and money inputs. Loaded once per organization on first use and reloaded when the
 * organization changes; `refresh()` after something that changes membership.
 */
@Injectable({ providedIn: 'root' })
export class OrgDirectory {
  private readonly session = inject(SessionStore);
  private readonly membersApi = inject(MembersApi);
  private readonly organizationApi = inject(OrganizationApi);

  private readonly members = resource({
    params: () => this.session.activeOrganizationId() ?? undefined,
    loader: () =>
      firstValueFrom(this.membersApi.list({ size: PEOPLE_LIMIT, sort: ['fullName,asc'] })),
  });

  private readonly organization = resource({
    params: () => this.session.activeOrganizationId() ?? undefined,
    loader: () => firstValueFrom(this.organizationApi.get()),
  });

  readonly people = computed<readonly Member[]>(() =>
    this.members.hasValue() ? this.members.value().content : [],
  );
  readonly peopleLoading = computed(() => this.members.isLoading());
  /** The organization's currency; budgets and costs must use it. */
  readonly currency = computed(() =>
    this.organization.hasValue() ? this.organization.value().currency : null,
  );

  /** The organization's time zone: its "today" decides the current week and what is overdue. */
  readonly timeZone = computed(() =>
    this.organization.hasValue() ? this.organization.value().timeZone : null,
  );

  /** Members holding one of `roles` (all members when omitted), by name. */
  peopleWith(roles?: readonly Role[]): Member[] {
    return this.people().filter((m) => !roles || roles.includes(m.role));
  }

  /** A member's name by user id (notifications carry ids, not names); undefined if unknown. */
  nameOf(userId: unknown): string | undefined {
    return typeof userId === 'string'
      ? this.people().find((m) => m.userId === userId)?.fullName
      : undefined;
  }

  refresh(): void {
    this.members.reload();
  }
}
