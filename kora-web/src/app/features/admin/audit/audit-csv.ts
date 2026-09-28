import { AuditEvent } from '../../../core/api/api.models';

/**
 * A cell as spreadsheet software reads it: quoted when needed, and text that starts like a formula
 * (`=`, `+`, `-`, `@`, tab, carriage return) prefixed with `'` so Excel shows it instead of running
 * it (CSV injection).
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The audit rows shown, one change per row group, for an investigation or a governance review. */
export function auditCsv(events: readonly AuditEvent[], headers: readonly string[]): string {
  const rows = events.map((e) =>
    [
      e.occurredAt,
      e.actor?.fullName ?? '',
      e.actorIp ?? '',
      e.action,
      e.entityType,
      e.entityLabel ?? '',
      e.entityId ?? '',
      e.outcome,
      Object.entries(e.changes)
        .map(
          ([field, change]) =>
            `${field}: ${JSON.stringify(change.before ?? null)} → ${JSON.stringify(change.after ?? null)}`,
        )
        .join('; '),
      e.correlationId ?? '',
    ].map(csvCell),
  );
  // A byte-order mark so Excel opens UTF-8 names (Kinyarwanda, French accents) correctly.
  return '﻿' + [headers.map(csvCell), ...rows].map((r) => r.join(',')).join('\r\n');
}
