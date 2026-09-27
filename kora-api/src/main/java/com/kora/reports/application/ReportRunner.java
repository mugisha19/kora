package com.kora.reports.application;

import com.kora.identity.AccountView;
import com.kora.identity.UserAccounts;
import com.kora.identity.UserLocale;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.organization.Memberships;
import com.kora.organization.OrganizationName;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.error.ProblemException;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.ReportFailed;
import com.kora.reports.ReportReady;
import com.kora.reports.domain.ReportJob;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Clock;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.MessageSource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Generates queued reports in the background (feature 21), after the request commits, through the outbox. Each
 * report is built as its requester, with their current membership: someone who lost access since asking gets a
 * failed job, not the data.
 */
@Component
class ReportRunner {

    private static final Logger LOG = LoggerFactory.getLogger(ReportRunner.class);

    /** Rendering is CPU and memory heavy; two at a time keeps the API responsive while reports are made. */
    private final Semaphore permits = new Semaphore(2);

    private final ReportJobRepository jobs;
    private final ReportExporterFactory factory;
    private final TenantTransactions transactions;
    private final Memberships memberships;
    private final MemberDirectory members;
    private final UserAccounts accounts;
    private final OrganizationName organizationName;
    private final OrganizationTimeZone timeZone;
    private final MessageSource messages;
    private final ApplicationEventPublisher events;
    private final MeterRegistry meters;
    private final Clock clock;

    ReportRunner(
            ReportJobRepository jobs,
            ReportExporterFactory factory,
            TenantTransactions transactions,
            Memberships memberships,
            MemberDirectory members,
            UserAccounts accounts,
            OrganizationName organizationName,
            OrganizationTimeZone timeZone,
            MessageSource messages,
            ApplicationEventPublisher events,
            MeterRegistry meters,
            Clock clock) {
        this.jobs = jobs;
        this.factory = factory;
        this.transactions = transactions;
        this.memberships = memberships;
        this.members = members;
        this.accounts = accounts;
        this.organizationName = organizationName;
        this.timeZone = timeZone;
        this.messages = messages;
        this.events = events;
        this.meters = meters;
        this.clock = clock;
    }

    @Async
    @TransactionalEventListener
    void on(ReportRequested requested) throws InterruptedException {
        permits.acquire();
        try {
            run(requested.reportId(), requested.organizationId());
        } finally {
            permits.release();
        }
    }

    /** Generates the job if it still needs it; public to the package for tests. */
    void run(UUID reportId, UUID organizationId) {
        Optional<ReportJob> started = transactions.inOrganization(
                organizationId,
                () -> jobs.findById(reportId)
                        // A redelivery of a finished job: nothing to do.
                        .filter(ReportJob::isPending)
                        .map(job -> {
                            job.start(clock.instant());
                            return jobs.save(job);
                        }));
        if (started.isEmpty()) {
            return;
        }
        ReportJob job = started.get();
        Timer.Sample sample = Timer.start(meters);
        String outcome = "ready";
        try {
            StoredReport stored = generate(job);
            transactions.inOrganization(organizationId, () -> {
                ReportJob current = jobs.findById(reportId).orElseThrow();
                current.ready(
                        stored.fileName(),
                        stored.storageKey(),
                        stored.contentType(),
                        stored.sizeBytes(),
                        clock.instant());
                jobs.save(current);
                events.publishEvent(new ReportReady(
                        "report-ready:" + reportId,
                        organizationId,
                        reportId,
                        current.getRequestedBy(),
                        current.getType(),
                        current.getFormat(),
                        stored.fileName()));
                return null;
            });
        } catch (RuntimeException failure) {
            outcome = "failed";
            LOG.warn("Report {} ({} {}) failed", reportId, job.getType(), job.getFormat(), failure);
            String reason = failure instanceof ProblemException problem
                    ? problem.getMessage()
                    : "The report could not be generated";
            transactions.inOrganization(organizationId, () -> {
                jobs.findById(reportId).ifPresent(current -> {
                    current.fail(reason, clock.instant());
                    jobs.save(current);
                    events.publishEvent(new ReportFailed(
                            "report-failed:" + reportId,
                            organizationId,
                            reportId,
                            current.getRequestedBy(),
                            current.getType(),
                            current.getFormat()));
                });
                return null;
            });
        } finally {
            sample.stop(Timer.builder("kora.reports.generation")
                    .description("Time to generate a report export")
                    .tag("type", job.getType().name())
                    .tag("format", job.getFormat().name())
                    .tag("outcome", outcome)
                    .register(meters));
        }
    }

    /** As the requester, in their organization; access is checked again by the source's services. */
    private StoredReport generate(ReportJob job) {
        UUID organizationId = job.getOrganizationId();
        ActiveMember member = memberships
                .activeMember(organizationId, job.getRequestedBy())
                .orElseThrow(() -> new IllegalStateException("The requester is no longer a member"));
        AccountView requester = accounts.get(job.getRequestedBy());
        UserLocale locale = UserLocale.fromCode(job.getLocale()).orElse(requester.locale());
        return TenantScope.callAs(
                organizationId,
                () -> CurrentMember.callAs(member, () -> {
                    String organization = transactions.readInOrganization(organizationId, organizationName::name);
                    ZoneId zone = transactions.readInOrganization(organizationId, timeZone::zone);
                    ExportRequest request = new ExportRequest(
                            job.getId(),
                            organizationId,
                            job.params(),
                            new MessageReportLabels(messages, members, accounts, locale.toLocale()),
                            organization,
                            requester.fullName(),
                            zone,
                            clock.instant());
                    return factory.create(job.getType(), job.getFormat()).run(request);
                }));
    }
}
