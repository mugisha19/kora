package com.kora.audit.application;

import com.kora.audit.domain.AuditEntry;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Read port for audit entries (tenant-filtered). */
public interface AuditEntryRepository {

    /** Newest first, at most {@code limit}. */
    List<AuditEntry> search(AuditSearch search, int limit);

    List<AuditEntry> findByEntityTypeAndEntityIdOrderByChainPositionAsc(String entityType, UUID entityId);

    /** Oldest first: the chain in the order it was written. */
    List<AuditEntry> chain(Instant from, Instant to);

    /** The entry just before {@code position}, whose hash the next one must carry. */
    Optional<AuditEntry> findFirstByChainPositionLessThanOrderByChainPositionDesc(long position);
}
