package com.kora.work.application;

import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.work.TaskChanged;
import com.kora.work.domain.Sprint;
import com.kora.work.domain.SprintStatus;
import com.kora.work.domain.Task;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Writes the burndown's daily values (feature 09): whenever the tasks of a project with an active sprint change, in the
 * same transaction, and every hour for every active sprint, so a day on which nothing changed still has a value. The
 * day is the organization's day.
 */
@Component
class BurndownRecorder {

    private static final Logger LOG = LoggerFactory.getLogger(BurndownRecorder.class);

    private final SprintRepository sprints;
    private final TaskRepository tasks;
    private final SprintDayProgressRepository days;
    private final OrganizationTimeZone timeZone;
    private final TenantTransactions transactions;
    private final Clock clock;

    BurndownRecorder(
            SprintRepository sprints,
            TaskRepository tasks,
            SprintDayProgressRepository days,
            OrganizationTimeZone timeZone,
            TenantTransactions transactions,
            Clock clock) {
        this.sprints = sprints;
        this.tasks = tasks;
        this.days = days;
        this.timeZone = timeZone;
        this.transactions = transactions;
        this.clock = clock;
    }

    @EventListener
    void on(TaskChanged event) {
        sprints.findFirstByProjectIdAndStatus(event.projectId(), SprintStatus.ACTIVE)
                .ifPresent(this::record);
    }

    @Scheduled(
            initialDelayString = "${kora.work.burndown.initial-delay:PT5M}",
            fixedDelayString = "${kora.work.burndown.interval:PT1H}")
    void recordActiveSprints() {
        List<Sprint> active = transactions.readInSystem(() -> sprints.findByStatus(SprintStatus.ACTIVE));
        for (Sprint sprint : active) {
            UUID sprintId = sprint.getId();
            transactions.inOrganization(sprint.getOrganizationId(), () -> {
                sprints.findById(sprintId)
                        .filter(current -> current.getStatus() == SprintStatus.ACTIVE)
                        .ifPresent(this::record);
                return null;
            });
        }
        LOG.debug("Recorded the burndown of {} active sprints", active.size());
    }

    /** The story points still open in the sprint, as of today. */
    void record(Sprint sprint) {
        int remaining = tasks.findBySprintId(sprint.getId()).stream()
                .filter(task -> !task.isDone())
                .mapToInt(Task::points)
                .sum();
        LocalDate today = LocalDate.now(clock.withZone(timeZone.zone()));
        days.upsert(UUID.randomUUID(), TenantScope.requireOrganization(), sprint.getId(), today, remaining);
    }
}
