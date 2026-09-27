import { ENGAGEMENTS, Engagement, StakeholderQuadrant } from '../../../../core/api/api.models';

/** The API's rule, for the dialog's live preview: "high" is 3 or more on the 1–5 scale. */
export function quadrantOf(power: number, interest: number): StakeholderQuadrant {
  if (power >= 3) return interest >= 3 ? 'MANAGE_CLOSELY' : 'KEEP_SATISFIED';
  return interest >= 3 ? 'KEEP_INFORMED' : 'MONITOR';
}

export function engagementLevel(engagement: Engagement): number {
  return ENGAGEMENTS.indexOf(engagement);
}

/**
 * The grid's layout: power rises upwards, interest to the right — so high power and low interest
 * is top left, as the classic power/interest grid draws it.
 */
export const GRID_LAYOUT: readonly StakeholderQuadrant[] = [
  'KEEP_SATISFIED',
  'MANAGE_CLOSELY',
  'MONITOR',
  'KEEP_INFORMED',
];
