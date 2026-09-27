package com.kora.platform.audit;

import java.util.List;

/**
 * Audit entries that were just committed, published after the commit so live views (the project activity feed) can
 * show them. Never published for a rolled-back transaction.
 */
public record AuditEventsRecorded(List<StoredAuditEvent> events) {

    public AuditEventsRecorded {
        events = List.copyOf(events);
    }
}
