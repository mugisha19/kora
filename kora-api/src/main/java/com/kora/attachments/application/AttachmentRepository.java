package com.kora.attachments.application;

import com.kora.attachments.domain.Attachment;
import com.kora.attachments.domain.AttachmentOwnerType;
import com.kora.attachments.domain.AttachmentStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for attachments (tenant-filtered, except in the system scope of the purge job). */
public interface AttachmentRepository {

    Optional<Attachment> findById(UUID id);

    List<Attachment> findByOwnerTypeAndOwnerIdAndStatusAndDeletedAtIsNullOrderByUploadedAtDesc(
            AttachmentOwnerType ownerType, UUID ownerId, AttachmentStatus status);

    /** Deleted before the first moment, or still pending (never completed) before the second. */
    List<Attachment> purgeable(Instant deletedBefore, Instant pendingBefore);

    Attachment save(Attachment attachment);

    void delete(Attachment attachment);
}
