import { Severity } from '../../../../core/api/api.models';

/** The API's bands, for previews before it answers: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical. */
export function severityOf(score: number): Severity {
  if (score >= 15) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5) return 'MEDIUM';
  return 'LOW';
}
