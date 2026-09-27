package com.kora.reports.application;

import com.kora.platform.storage.FileStorage;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.domain.ReportJob;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Deletes report files and their jobs once they expire (7 days), each organization's in its own scope. */
@Component
public class ReportPurge {

    private static final Logger LOG = LoggerFactory.getLogger(ReportPurge.class);

    private final ReportJobRepository jobs;
    private final FileStorage storage;
    private final TenantTransactions transactions;
    private final Clock clock;

    ReportPurge(ReportJobRepository jobs, FileStorage storage, TenantTransactions transactions, Clock clock) {
        this.jobs = jobs;
        this.storage = storage;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Scheduled(
            initialDelayString = "${kora.reports.purge.initial-delay:PT25M}",
            fixedDelayString = "${kora.reports.purge.interval:PT6H}")
    public void purgeAll() {
        Map<UUID, List<UUID>> due =
                transactions.readInSystem(() -> jobs.findByExpiresAtBefore(clock.instant())).stream()
                        .collect(Collectors.groupingBy(
                                ReportJob::getOrganizationId,
                                Collectors.mapping(ReportJob::getId, Collectors.toList())));
        due.forEach((organization, ids) -> {
            try {
                transactions.inOrganization(organization, () -> {
                    ids.forEach(id -> jobs.findById(id).ifPresent(job -> {
                        if (job.getStorageKey() != null) {
                            storage.delete(job.getStorageKey());
                        }
                        jobs.delete(job);
                    }));
                    return null;
                });
            } catch (RuntimeException failure) {
                LOG.warn("Could not purge the reports of organization {}", organization, failure);
            }
        });
    }
}
