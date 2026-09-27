package com.kora.reports.application;

import java.util.UUID;

/** A job was queued: generate it after the commit. Through the outbox, so a crash doesn't lose it. */
public record ReportRequested(UUID reportId, UUID organizationId) {}
