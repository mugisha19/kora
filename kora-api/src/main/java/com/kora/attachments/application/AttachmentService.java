package com.kora.attachments.application;

import com.kora.attachments.AttachmentErrorCodes;
import com.kora.attachments.domain.Attachment;
import com.kora.attachments.domain.Attachment.Owner;
import com.kora.attachments.domain.AttachmentOwnerType;
import com.kora.attachments.domain.AttachmentStatus;
import com.kora.attachments.domain.FileType;
import com.kora.organization.CurrentMember;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Attachments (feature 20). The owner's project decides access: its managers and contributors upload, everyone who
 * sees it lists and downloads, and the uploader or a manager deletes.
 */
@Service
public class AttachmentService {

    static final Duration UPLOAD_VALIDITY = Duration.ofMinutes(15);
    static final Duration DOWNLOAD_VALIDITY = Duration.ofMinutes(5);

    private final AttachmentRepository attachments;
    private final OwnerProjects owners;
    private final ProjectAccess projects;
    private final FileStorage storage;
    private final FileInspector inspector;
    private final Clock clock;

    AttachmentService(
            AttachmentRepository attachments,
            OwnerProjects owners,
            ProjectAccess projects,
            FileStorage storage,
            FileInspector inspector,
            Clock clock) {
        this.attachments = attachments;
        this.owners = owners;
        this.projects = projects;
        this.storage = storage;
        this.inspector = inspector;
        this.clock = clock;
    }

    public record NewUpload(
            AttachmentOwnerType ownerType, UUID ownerId, String fileName, String contentType, long sizeBytes) {}

    public record Upload(Attachment attachment, URI url, String contentType, Instant expiresAt) {}

    public record Download(URI url, Instant expiresAt) {}

    @Transactional
    public Upload start(NewUpload request) {
        Owner owner = owners.resolve(request.ownerType(), request.ownerId());
        projects.participating(owner.projectId());
        String fileName = request.fileName().strip();
        FileType type = FileType.ofFileName(fileName)
                .orElseThrow(() -> new InvalidInputException(FieldViolation.of(
                        "fileName",
                        PlatformErrorCodes.Field.INVALID,
                        "Allowed: PDF, PNG, JPEG, GIF, WebP, TXT, CSV, DOCX, XLSX and PPTX files")));
        if (!type.mediaType().equalsIgnoreCase(request.contentType().strip())) {
            throw new InvalidInputException(FieldViolation.of(
                    "contentType", PlatformErrorCodes.Field.INVALID, "must be " + type.mediaType() + " for this file"));
        }
        if (request.sizeBytes() < 1 || request.sizeBytes() > FileType.MAX_SIZE_BYTES) {
            throw new InvalidInputException(
                    FieldViolation.of("sizeBytes", PlatformErrorCodes.Field.RANGE, "at most 25 MB"));
        }
        Instant now = clock.instant();
        Attachment attachment = attachments.save(Attachment.pending(
                CurrentMember.get().organizationId(),
                owner,
                fileName,
                type,
                request.sizeBytes(),
                CurrentMember.get().userId(),
                now));
        return new Upload(
                attachment,
                storage.uploadUrl(attachment.getStorageKey(), type.mediaType(), UPLOAD_VALIDITY),
                type.mediaType(),
                now.plus(UPLOAD_VALIDITY));
    }

    /**
     * Checks the uploaded file and makes it available. A file that isn't what it claims (or not the announced size)
     * is removed from storage straight away; its pending record is purged later.
     */
    @Transactional
    public Attachment complete(UUID attachmentId) {
        Attachment attachment = find(attachmentId);
        projects.participating(attachment.getProjectId());
        if (!attachment.getUploadedBy().equals(CurrentMember.get().userId())) {
            throw new ForbiddenException("Only the uploader can complete an upload");
        }
        if (attachment.getStatus() == AttachmentStatus.AVAILABLE) {
            throw new ConflictException(AttachmentErrorCodes.ALREADY_COMPLETED, "This upload is already complete");
        }
        Optional<Long> stored = storage.size(attachment.getStorageKey());
        if (stored.isEmpty()) {
            throw new ConflictException(AttachmentErrorCodes.NOT_UPLOADED, "Upload the file before completing");
        }
        if (stored.get() != attachment.getSizeBytes()) {
            storage.delete(attachment.getStorageKey());
            throw mismatch("The uploaded file isn't the announced size");
        }
        FileInspector.Inspection inspection = inspector.inspect(attachment.getStorageKey());
        FileType declared = attachment.declaredType();
        if (inspection.detected().filter(declared::accepts).isEmpty()) {
            storage.delete(attachment.getStorageKey());
            throw mismatch("The file's content isn't a " + declared.name() + " file");
        }
        attachment.complete(inspection.detected().get(), inspection.sha256(), clock.instant());
        return attachments.save(attachment);
    }

    @Transactional(readOnly = true)
    public List<Attachment> list(AttachmentOwnerType ownerType, UUID ownerId) {
        Owner owner = owners.resolve(ownerType, ownerId);
        projects.readable(owner.projectId());
        return attachments.findByOwnerTypeAndOwnerIdAndStatusAndDeletedAtIsNullOrderByUploadedAtDesc(
                ownerType, ownerId, AttachmentStatus.AVAILABLE);
    }

    @Transactional(readOnly = true)
    public Download download(UUID attachmentId) {
        Attachment attachment = find(attachmentId);
        projects.readable(attachment.getProjectId());
        if (!attachment.isAvailable()) {
            throw new ConflictException(AttachmentErrorCodes.NOT_UPLOADED, "The file isn't available yet");
        }
        return new Download(
                storage.downloadUrl(attachment.getStorageKey(), attachment.getFileName(), DOWNLOAD_VALIDITY),
                clock.instant().plus(DOWNLOAD_VALIDITY));
    }

    @Transactional
    public void delete(UUID attachmentId) {
        Attachment attachment = find(attachmentId);
        projects.readable(attachment.getProjectId());
        if (attachment.getUploadedBy().equals(CurrentMember.get().userId())) {
            projects.participating(attachment.getProjectId());
        } else {
            projects.manageable(attachment.getProjectId());
        }
        attachment.delete(clock.instant());
        attachments.save(attachment);
    }

    private Attachment find(UUID attachmentId) {
        return attachments
                .findById(attachmentId)
                .filter(found -> !found.isDeleted())
                .orElseThrow(() -> NotFoundException.of("attachment", attachmentId));
    }

    private static ConflictException mismatch(String detail) {
        return new ConflictException(AttachmentErrorCodes.CONTENT_MISMATCH, detail);
    }
}
