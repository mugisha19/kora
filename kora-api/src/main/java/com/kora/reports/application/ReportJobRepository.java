package com.kora.reports.application;

import com.kora.reports.domain.ReportJob;
import com.kora.reports.domain.ReportStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for report jobs (tenant-filtered, except in the system scope of the purge). */
public interface ReportJobRepository {

    Optional<ReportJob> findById(UUID id);

    List<ReportJob> findTop50ByRequestedByOrderByCreatedAtDesc(UUID requestedBy);

    long countByRequestedByAndStatusIn(UUID requestedBy, Collection<ReportStatus> statuses);

    List<ReportJob> findByExpiresAtBefore(Instant moment);

    ReportJob save(ReportJob job);

    void delete(ReportJob job);
}
