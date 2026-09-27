package com.kora.audit.adapter.web;

import com.kora.platform.audit.AuditEventsRecorded;
import com.kora.platform.audit.AuditRecord;
import com.kora.platform.audit.StoredAuditEvent;
import com.kora.platform.tenancy.TenantTransactions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Pushes committed project activity to {@code /topic/projects/{id}} (feature 18), so open boards and feeds update
 * without polling. Best effort: a missed push is caught up by the next page load, which reads the same trail.
 */
@Component
class ActivityBroadcaster {

    private static final Logger LOG = LoggerFactory.getLogger(ActivityBroadcaster.class);

    private final ObjectProvider<SimpMessagingTemplate> messaging;
    private final AuditResponses responses;
    private final TenantTransactions transactions;

    ActivityBroadcaster(
            ObjectProvider<SimpMessagingTemplate> messaging,
            AuditResponses responses,
            TenantTransactions transactions) {
        this.messaging = messaging;
        this.responses = responses;
        this.transactions = transactions;
    }

    @EventListener
    void on(AuditEventsRecorded recorded) {
        SimpMessagingTemplate broker = messaging.getIfAvailable();
        if (broker == null) {
            return;
        }
        for (StoredAuditEvent event : recorded.events()) {
            AuditRecord record = event.record();
            if (record.projectId() == null || record.organizationId() == null) {
                continue;
            }
            try {
                var entry = transactions.readInOrganization(
                        record.organizationId(),
                        () -> AuditResponses.activity(
                                event.id(),
                                record.occurredAt(),
                                record.actorId() == null ? null : responses.actor(record.actorId()),
                                record.action(),
                                record.entityType(),
                                record.entityId(),
                                record.entityLabel(),
                                record.changes().keySet()));
                broker.convertAndSend("/topic/projects/" + record.projectId(), entry);
            } catch (RuntimeException failure) {
                LOG.warn("Could not push activity {} to project {}", event.id(), record.projectId(), failure);
            }
        }
    }
}
