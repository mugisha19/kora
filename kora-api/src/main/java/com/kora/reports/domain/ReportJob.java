package com.kora.reports.domain;

import com.kora.reports.ReportFormat;
import com.kora.reports.ReportParams;
import com.kora.reports.ReportType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * One report export (feature 21), from the request to the file. Audited like everything else, so the trail shows
 * who exported what: exports are how data leaves the system.
 */
@Entity
@Table(name = "report_jobs")
public class ReportJob {

    /** Files are for sharing now, not archiving: kept a week, then purged with their job. */
    public static final Duration KEEP = Duration.ofDays(7);

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "requested_by", nullable = false, updatable = false)
    private UUID requestedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ReportType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private ReportFormat format;

    @Column(name = "project_id", updatable = false)
    private UUID projectId;

    @Column(name = "portfolio_id", updatable = false)
    private UUID portfolioId;

    @Column(name = "date_from", updatable = false)
    private LocalDate dateFrom;

    @Column(name = "date_to", updatable = false)
    private LocalDate dateTo;

    @Column(nullable = false, updatable = false)
    private String locale;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportStatus status;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "storage_key")
    private String storageKey;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected ReportJob() {
        // for JPA
    }

    public static ReportJob queue(
            UUID organizationId,
            UUID requestedBy,
            ReportType type,
            ReportFormat format,
            ReportParams params,
            String locale,
            Instant now) {
        ReportJob job = new ReportJob();
        job.id = UUID.randomUUID();
        job.organizationId = Objects.requireNonNull(organizationId);
        job.requestedBy = Objects.requireNonNull(requestedBy);
        job.type = Objects.requireNonNull(type);
        job.format = Objects.requireNonNull(format);
        job.projectId = params.projectId();
        job.portfolioId = params.portfolioId();
        job.dateFrom = params.from();
        job.dateTo = params.to();
        job.locale = Objects.requireNonNull(locale);
        job.status = ReportStatus.QUEUED;
        job.createdAt = Objects.requireNonNull(now);
        job.expiresAt = now.plus(KEEP);
        return job;
    }

    /** Whether it still needs generating; a RUNNING job is generated again after a crash. */
    public boolean isPending() {
        return status == ReportStatus.QUEUED || status == ReportStatus.RUNNING;
    }

    public void start(Instant now) {
        this.status = ReportStatus.RUNNING;
        this.startedAt = now;
    }

    public void ready(String name, String key, String type, long size, Instant now) {
        this.status = ReportStatus.READY;
        this.fileName = name;
        this.storageKey = key;
        this.contentType = type;
        this.sizeBytes = size;
        this.completedAt = now;
        this.expiresAt = now.plus(KEEP);
    }

    public void fail(String reason, Instant now) {
        this.status = ReportStatus.FAILED;
        this.failureReason = reason.length() <= 300 ? reason : reason.substring(0, 300);
        this.completedAt = now;
    }

    public ReportParams params() {
        return new ReportParams(projectId, portfolioId, dateFrom, dateTo);
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getRequestedBy() {
        return requestedBy;
    }

    public ReportType getType() {
        return type;
    }

    public ReportFormat getFormat() {
        return format;
    }

    public String getLocale() {
        return locale;
    }

    public ReportStatus getStatus() {
        return status;
    }

    public String getFileName() {
        return fileName;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public Long getSizeBytes() {
        return sizeBytes;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }
}
