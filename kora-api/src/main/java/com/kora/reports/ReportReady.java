package com.kora.reports;

import java.util.UUID;

/** A report file is ready for its requester. Delivered through the outbox after commit (notifications). */
public record ReportReady(
        String eventKey,
        UUID organizationId,
        UUID reportId,
        UUID requestedBy,
        ReportType type,
        ReportFormat format,
        String fileName) {}
