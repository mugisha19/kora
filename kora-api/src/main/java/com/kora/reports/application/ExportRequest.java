package com.kora.reports.application;

import com.kora.reports.ReportLabels;
import com.kora.reports.ReportParams;
import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

/** Everything an export needs besides the data: whose it is, and how to present it. */
public record ExportRequest(
        UUID reportId,
        UUID organizationId,
        ReportParams params,
        ReportLabels labels,
        String organizationName,
        String requesterName,
        ZoneId zone,
        Instant now) {}
