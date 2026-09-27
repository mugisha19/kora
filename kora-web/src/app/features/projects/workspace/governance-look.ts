import { Injector } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { ChangeRequestStatus, IssueStatus } from '../../../core/api/api.models';
import { StatusTone } from '../../../shared/ui/status-chip';

/*
 * Looks shared by the governance tabs (features 11–14): severity bands, statuses and the side
 * sheet the risk and issue details open in. Every mark pairs a colour with an icon shape and a
 * word, so it reads the same without colour.
 */

export { SEVERITY_LOOK, SeverityChip } from '../../../shared/ui/severity-chip';

export const ISSUE_STATUS_LOOK: Record<IssueStatus, { tone: StatusTone; icon: string }> = {
  OPEN: { tone: 'warning', icon: 'error' },
  IN_PROGRESS: { tone: 'info', icon: 'schedule' },
  RESOLVED: { tone: 'success', icon: 'check_circle' },
  CLOSED: { tone: 'neutral', icon: 'check' },
};

export const CHANGE_STATUS_LOOK: Record<ChangeRequestStatus, { tone: StatusTone; icon: string }> = {
  DRAFT: { tone: 'neutral', icon: 'edit' },
  SUBMITTED: { tone: 'info', icon: 'send' },
  IN_REVIEW: { tone: 'info', icon: 'schedule' },
  APPROVED: { tone: 'success', icon: 'check_circle' },
  REJECTED: { tone: 'danger', icon: 'cancel' },
  WITHDRAWN: { tone: 'neutral', icon: 'undo' },
  IMPLEMENTED: { tone: 'success', icon: 'check' },
};

/**
 * A dialog that slides in from the right, full height — the task sheet's look. `injector` lets the
 * sheet use the tab's facade and the project's store.
 */
export function sideSheet<D>(data: D, injector: Injector): MatDialogConfig<D> {
  return {
    data,
    injector,
    position: { right: '0' },
    height: '100dvh',
    width: 'min(560px, 100vw)',
    maxWidth: '100vw',
    panelClass: 'kora-side-sheet',
    autoFocus: 'dialog',
  };
}
