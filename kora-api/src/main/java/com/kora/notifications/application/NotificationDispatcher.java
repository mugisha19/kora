package com.kora.notifications.application;

import com.kora.governance.ApprovalRequested;
import com.kora.governance.ChangeRequestDecided;
import com.kora.governance.IssueEscalated;
import com.kora.governance.RiskReviewOverdue;
import com.kora.notifications.domain.NotificationType;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.organization.Role;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.reports.ReportFailed;
import com.kora.reports.ReportReady;
import com.kora.resourcing.TimesheetDecided;
import com.kora.work.TaskAssigned;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns domain events into notifications (Observer). Each event arrives through the transactional outbox
 * ({@code event_publication}): it is stored with the change that caused it, handled after that commit on another
 * thread, and resubmitted after a crash, so a rolled-back change never notifies and a committed one always does.
 * Being asynchronous, each handler binds the event's organization itself, and it binds it before starting its
 * transaction (not {@code @ApplicationModuleListener}, whose transaction would start unscoped).
 */
@Component
class NotificationDispatcher {

    private final TenantTransactions transactions;
    private final MemberDirectory members;
    private final NotificationDelivery delivery;

    NotificationDispatcher(TenantTransactions transactions, MemberDirectory members, NotificationDelivery delivery) {
        this.transactions = transactions;
        this.members = members;
        this.delivery = delivery;
    }

    @Async
    @TransactionalEventListener
    void on(TaskAssigned event) {
        send(
                event.organizationId(),
                () -> List.of(event.assigneeId()),
                NotificationType.TASK_ASSIGNED,
                params("key", event.key(), "title", event.title(), "actorId", event.actorId()),
                "/projects/" + event.projectId() + "/tasks/" + event.taskId(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(ApprovalRequested event) {
        send(
                event.organizationId(),
                () -> approvers(event),
                NotificationType.APPROVAL_REQUESTED,
                params("key", event.key(), "title", event.title(), "requesterId", event.requesterId()),
                "/projects/" + event.projectId() + "/change-requests/" + event.changeRequestId(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(ChangeRequestDecided event) {
        send(
                event.organizationId(),
                () -> event.requesterId() == null ? List.of() : List.of(event.requesterId()),
                NotificationType.CHANGE_REQUEST_DECIDED,
                params(
                        "key",
                        event.key(),
                        "title",
                        event.title(),
                        "approved",
                        event.approved(),
                        "actorId",
                        event.actorId()),
                "/projects/" + event.projectId() + "/change-requests/" + event.changeRequestId(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(TimesheetDecided event) {
        send(
                event.organizationId(),
                () -> List.of(event.ownerId()),
                NotificationType.TIMESHEET_DECIDED,
                params(
                        "week",
                        event.week(),
                        "approved",
                        event.approved(),
                        "comment",
                        event.comment(),
                        "actorId",
                        event.actorId()),
                "/timesheets/" + event.week(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(RiskReviewOverdue event) {
        send(
                event.organizationId(),
                () -> List.of(event.ownerId()),
                NotificationType.RISK_REVIEW_OVERDUE,
                params("key", event.key(), "title", event.title(), "reviewDate", event.reviewDate()),
                "/projects/" + event.projectId() + "/risks/" + event.riskId(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(IssueEscalated event) {
        send(
                event.organizationId(),
                () -> holdersOf(Role.PMO, null),
                NotificationType.ISSUE_ESCALATED,
                params("key", event.key(), "title", event.title()),
                "/projects/" + event.projectId() + "/issues/" + event.issueId(),
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(ReportReady event) {
        send(
                event.organizationId(),
                () -> List.of(event.requestedBy()),
                NotificationType.REPORT_READY,
                params(
                        "reportId",
                        event.reportId(),
                        "type",
                        event.type().name(),
                        "format",
                        event.format().name(),
                        "fileName",
                        event.fileName()),
                "/reports",
                event.eventKey());
    }

    @Async
    @TransactionalEventListener
    void on(ReportFailed event) {
        send(
                event.organizationId(),
                () -> List.of(event.requestedBy()),
                NotificationType.REPORT_FAILED,
                params(
                        "reportId",
                        event.reportId(),
                        "type",
                        event.type().name(),
                        "format",
                        event.format().name()),
                "/reports",
                event.eventKey());
    }

    private void send(
            UUID organizationId,
            Supplier<List<UUID>> recipients,
            NotificationType type,
            Map<String, Object> params,
            String link,
            String eventKey) {
        Runnable deliverAll = () -> transactions.inOrganization(organizationId, () -> {
            for (UUID recipient : Set.copyOf(recipients.get())) {
                delivery.deliver(organizationId, recipient, type, params, link, eventKey);
            }
            return null;
        });
        try {
            deliverAll.run();
        } catch (DataIntegrityViolationException raced) {
            // A concurrent delivery of the same event stored it first (unique event key); the retry skips it.
            deliverAll.run();
        }
    }

    /** A named approver, or everyone holding the step's role except the requester (nobody approves their own). */
    private List<UUID> approvers(ApprovalRequested event) {
        if (event.approverId() != null) {
            return List.of(event.approverId());
        }
        if (event.approverRole() == null) {
            return List.of();
        }
        return holdersOf(Role.valueOf(event.approverRole()), event.requesterId());
    }

    /** Holders of the role; administrators stand in when nobody holds it, so the alert always reaches someone. */
    private List<UUID> holdersOf(Role role, UUID except) {
        List<MemberSummary> everyone = members.everyone();
        List<UUID> holders = idsWith(everyone, role, except);
        return holders.isEmpty() && role != Role.ORG_ADMIN ? idsWith(everyone, Role.ORG_ADMIN, except) : holders;
    }

    private static List<UUID> idsWith(List<MemberSummary> everyone, Role role, UUID except) {
        return everyone.stream()
                .filter(member -> member.role() == role)
                .map(MemberSummary::userId)
                .filter(id -> !id.equals(except))
                .toList();
    }

    /** Parameters in a stable order, leaving out absent values (JSON has no use for them). */
    private static Map<String, Object> params(Object... keysAndValues) {
        Map<String, Object> params = new LinkedHashMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            Object value = keysAndValues[i + 1];
            if (value != null) {
                params.put(
                        (String) keysAndValues[i],
                        value instanceof UUID || value instanceof LocalDate ? value.toString() : value);
            }
        }
        return params;
    }
}
