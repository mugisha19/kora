package com.kora.attachments.application;

import com.kora.attachments.domain.Attachment;
import com.kora.platform.tenancy.TenantTransactions;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Removes files for good (feature 20): deleted ones after 30 days, and uploads never completed after a day. Finds
 * them across organizations, then removes each organization's in its own scope, so the removal is audited there.
 */
@Component
public class AttachmentPurge {

    private static final Logger LOG = LoggerFactory.getLogger(AttachmentPurge.class);
    static final Duration KEEP_DELETED = Duration.ofDays(30);
    static final Duration KEEP_PENDING = Duration.ofDays(1);

    private final AttachmentRepository attachments;
    private final FileStorage storage;
    private final TenantTransactions transactions;
    private final Clock clock;

    AttachmentPurge(
            AttachmentRepository attachments, FileStorage storage, TenantTransactions transactions, Clock clock) {
        this.attachments = attachments;
        this.storage = storage;
        this.transactions = transactions;
        this.clock = clock;
    }

    @Scheduled(
            initialDelayString = "${kora.attachments.purge.initial-delay:PT20M}",
            fixedDelayString = "${kora.attachments.purge.interval:PT6H}")
    public void purgeAll() {
        Instant now = clock.instant();
        Map<UUID, List<UUID>> due =
                transactions
                        .readInSystem(() -> attachments.purgeable(now.minus(KEEP_DELETED), now.minus(KEEP_PENDING)))
                        .stream()
                        .collect(Collectors.groupingBy(
                                Attachment::getOrganizationId,
                                Collectors.mapping(Attachment::getId, Collectors.toList())));
        due.forEach((organization, ids) -> {
            try {
                transactions.inOrganization(organization, () -> {
                    ids.forEach(this::purge);
                    return null;
                });
            } catch (RuntimeException failure) {
                LOG.warn("Could not purge the attachments of organization {}", organization, failure);
            }
        });
    }

    private void purge(UUID id) {
        attachments.findById(id).ifPresent(attachment -> {
            storage.delete(attachment.getStorageKey());
            attachments.delete(attachment);
        });
    }
}
