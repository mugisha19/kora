import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChangeRequest } from '../api/api.models';
import { ChangeRequestsApi } from '../api/change-requests.api';
import { SessionStore } from '../session/session.store';

/**
 * "My approvals" (feature 14): change requests waiting for the signed-in person's decision, for
 * the toolbar badge and the approvals page. Reloads when the active organization changes and
 * after every decision; live updates arrive with notifications (Phase 9).
 */
@Injectable({ providedIn: 'root' })
export class ApprovalsInbox {
  private readonly api = inject(ChangeRequestsApi);
  private readonly session = inject(SessionStore);

  private readonly items = signal<ChangeRequest[] | null>(null);
  private readonly failed = signal(false);
  readonly requests = this.items.asReadonly();
  readonly error = this.failed.asReadonly();
  readonly count = computed(() => this.items()?.length ?? 0);

  constructor() {
    effect(() => {
      const organizationId = this.session.activeOrganizationId();
      untracked(() => {
        this.items.set(null);
        if (organizationId) void this.refresh();
      });
    });
  }

  async refresh(): Promise<void> {
    try {
      this.items.set(await firstValueFrom(this.api.pending()));
      this.failed.set(false);
    } catch {
      // The badge keeps its last count; the page shows the error.
      this.failed.set(true);
    }
  }
}
