package com.kora.reports;

import java.util.UUID;

/** A report could not be generated. Delivered through the outbox after commit (notifications). */
public record ReportFailed(
        String eventKey, UUID organizationId, UUID reportId, UUID requestedBy, ReportType type, ReportFormat format) {}
