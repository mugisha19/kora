import { TimesheetStatus, UtilizationBand } from '../../core/api/api.models';
import { StatusTone } from './status-chip';

/** Timesheet statuses: tone, icon and (in the templates) the word. */
export const SHEET_LOOK: Record<TimesheetStatus, { tone: StatusTone; icon: string }> = {
  DRAFT: { tone: 'neutral', icon: 'edit' },
  SUBMITTED: { tone: 'info', icon: 'send' },
  APPROVED: { tone: 'success', icon: 'check_circle' },
  REJECTED: { tone: 'danger', icon: 'undo' },
};

/** Utilization bands: an icon of its own shape for each, beside the word. */
export const BAND_ICON: Record<UtilizationBand, string> = {
  UNDER: 'keyboard_arrow_down',
  HEALTHY: 'check_circle',
  OVER: 'warning',
};
