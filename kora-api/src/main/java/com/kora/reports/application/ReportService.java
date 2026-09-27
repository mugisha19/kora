package com.kora.reports.application;

import com.kora.identity.UserAccounts;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.storage.FileStorage;
import com.kora.reports.ReportErrorCodes;
import com.kora.reports.ReportFormat;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportType;
import com.kora.reports.domain.ReportJob;
import com.kora.reports.domain.ReportStatus;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Requesting and following report exports (feature 21). Every member may export what they can see; the report's
 * source checks that. Jobs are private to their requester.
 */
@Service
public class ReportService {

    /** Generation is heavy: a few waiting jobs per person is plenty for real use and stops accidental floods. */
    static final int MAX_PENDING = 5;

    static final Duration DOWNLOAD_VALIDITY = Duration.ofMinutes(5);

    private final ReportJobRepository jobs;
    private final ReportExporterFactory factory;
    private final UserAccounts accounts;
    private final FileStorage storage;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    ReportService(
            ReportJobRepository jobs,
            ReportExporterFactory factory,
            UserAccounts accounts,
            FileStorage storage,
            ApplicationEventPublisher events,
            Clock clock) {
        this.jobs = jobs;
        this.factory = factory;
        this.accounts = accounts;
        this.storage = storage;
        this.events = events;
        this.clock = clock;
    }

    /** A job and, once it's ready, a fresh link to its file. */
    public record JobView(ReportJob job, URI downloadUrl, Instant downloadExpiresAt) {}

    @Transactional
    public ReportJob request(ReportType type, ReportFormat format, ReportParams params) {
        ActiveMember me = CurrentMember.get();
        ReportParams given = params == null ? ReportParams.none() : params;
        factory.source(type).check(given);
        if (jobs.countByRequestedByAndStatusIn(me.userId(), EnumSet.of(ReportStatus.QUEUED, ReportStatus.RUNNING))
                >= MAX_PENDING) {
            throw new ConflictException(
                    ReportErrorCodes.TOO_MANY_PENDING,
                    "Wait for your reports in progress to finish before asking for more");
        }
        ReportJob job = jobs.save(ReportJob.queue(
                me.organizationId(),
                me.userId(),
                type,
                format,
                given,
                accounts.get(me.userId()).locale().code(),
                clock.instant()));
        events.publishEvent(new ReportRequested(job.getId(), me.organizationId()));
        return job;
    }

    @Transactional(readOnly = true)
    public List<ReportJob> mine() {
        return jobs.findTop50ByRequestedByOrderByCreatedAtDesc(
                CurrentMember.get().userId());
    }

    @Transactional(readOnly = true)
    public JobView get(UUID reportId) {
        UUID me = CurrentMember.get().userId();
        ReportJob job = jobs.findById(reportId)
                .filter(found -> found.getRequestedBy().equals(me))
                .orElseThrow(() -> NotFoundException.of("report", reportId));
        return view(job);
    }

    public JobView view(ReportJob job) {
        if (job.getStatus() != ReportStatus.READY) {
            return new JobView(job, null, null);
        }
        return new JobView(
                job,
                storage.downloadUrl(job.getStorageKey(), job.getFileName(), DOWNLOAD_VALIDITY),
                clock.instant().plus(DOWNLOAD_VALIDITY));
    }
}
