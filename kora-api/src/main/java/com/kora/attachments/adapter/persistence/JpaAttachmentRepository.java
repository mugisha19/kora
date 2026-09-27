package com.kora.attachments.adapter.persistence;

import com.kora.attachments.application.AttachmentRepository;
import com.kora.attachments.domain.Attachment;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaAttachmentRepository extends Repository<Attachment, UUID>, AttachmentRepository {

    @Override
    @Query("""
            select a from Attachment a
            where (a.deletedAt is not null and a.deletedAt < :deletedBefore)
               or (a.status = com.kora.attachments.domain.AttachmentStatus.PENDING and a.uploadedAt < :pendingBefore)
            """)
    List<Attachment> purgeable(
            @Param("deletedBefore") Instant deletedBefore, @Param("pendingBefore") Instant pendingBefore);
}
