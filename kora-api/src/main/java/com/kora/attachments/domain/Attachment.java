package com.kora.attachments.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;

/**
 * A file on a project item (feature 20). Starts {@code PENDING} while the client uploads straight to storage, becomes
 * {@code AVAILABLE} once its real type and size are checked, and when deleted is kept (hidden) for 30 days before the
 * file is purged, so a mistaken delete can be undone by support.
 */
@Entity
@Table(name = "attachments")
public class Attachment {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "owner_type", nullable = false, updatable = false)
    private AttachmentOwnerType ownerType;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "project_id", nullable = false, updatable = false)
    private UUID projectId;

    @Column(name = "file_name", nullable = false, updatable = false)
    private String fileName;

    @Column(name = "declared_content_type", nullable = false, updatable = false)
    private String declaredContentType;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    private long sizeBytes;

    private String sha256;

    @Column(name = "storage_key", nullable = false, updatable = false)
    private String storageKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AttachmentStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "scan_status", nullable = false)
    private ScanStatus scanStatus;

    @Column(name = "uploaded_by", nullable = false, updatable = false)
    private UUID uploadedBy;

    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Attachment() {
        // for JPA
    }

    public record Owner(AttachmentOwnerType type, UUID id, UUID projectId) {}

    public static Attachment pending(
            UUID organizationId, Owner owner, String fileName, FileType type, long sizeBytes, UUID by, Instant now) {
        Attachment attachment = new Attachment();
        attachment.id = UUID.randomUUID();
        attachment.organizationId = Objects.requireNonNull(organizationId);
        attachment.ownerType = owner.type();
        attachment.ownerId = owner.id();
        attachment.projectId = owner.projectId();
        attachment.fileName = Objects.requireNonNull(fileName);
        attachment.declaredContentType = type.mediaType();
        attachment.sizeBytes = sizeBytes;
        // Our own key, never the user's file name: no path tricks, and names can repeat.
        attachment.storageKey = "org/" + organizationId + "/" + attachment.id;
        attachment.status = AttachmentStatus.PENDING;
        attachment.scanStatus = ScanStatus.NOT_SCANNED;
        attachment.uploadedBy = Objects.requireNonNull(by);
        attachment.uploadedAt = Objects.requireNonNull(now);
        return attachment;
    }

    /** The file was checked: it really is {@code detected}. */
    public void complete(FileType detected, String digest, Instant now) {
        this.contentType = detected.mediaType();
        this.sha256 = digest;
        this.status = AttachmentStatus.AVAILABLE;
        this.completedAt = now;
    }

    public void delete(Instant now) {
        if (deletedAt == null) {
            this.deletedAt = now;
        }
    }

    public boolean isAvailable() {
        return status == AttachmentStatus.AVAILABLE && deletedAt == null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /** The type the file name claims, which the content must match. */
    public FileType declaredType() {
        return FileType.ofFileName(fileName).orElseThrow();
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public AttachmentOwnerType getOwnerType() {
        return ownerType;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public UUID getProjectId() {
        return projectId;
    }

    public String getFileName() {
        return fileName;
    }

    public String getDeclaredContentType() {
        return declaredContentType;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getSha256() {
        return sha256;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public AttachmentStatus getStatus() {
        return status;
    }

    public ScanStatus getScanStatus() {
        return scanStatus;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public Instant getUploadedAt() {
        return uploadedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }
}
