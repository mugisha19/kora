package com.kora.work.application;

import com.kora.platform.demo.DemoHistory;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.work.domain.Sprint;
import com.kora.work.domain.SprintStatus;
import com.kora.work.domain.Task;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Demo data (feature 22): the daily burndown of sprints that ran before the demo existed. The recorder only ever
 * writes today's value; this draws the days before as a team would have burned them, from the committed points to
 * where the sprint ended (or stands today).
 */
@Component
@Profile("demo")
class DemoBurndownHistory implements DemoHistory {

    private final SprintRepository sprints;
    private final TaskRepository tasks;
    private final SprintDayProgressRepository days;
    private final TenantTransactions transactions;

    DemoBurndownHistory(
            SprintRepository sprints,
            TaskRepository tasks,
            SprintDayProgressRepository days,
            TenantTransactions transactions) {
        this.sprints = sprints;
        this.tasks = tasks;
        this.days = days;
        this.transactions = transactions;
    }

    @Override
    public void backfill(UUID organizationId, LocalDate today) {
        transactions.inOrganization(organizationId, () -> {
            List<Sprint> run = new ArrayList<>(sprints.findByStatus(SprintStatus.ACTIVE));
            run.addAll(sprints.findByStatus(SprintStatus.CLOSED));
            for (Sprint sprint : run) {
                draw(organizationId, sprint, today);
            }
            return null;
        });
    }

    private void draw(UUID organizationId, Sprint sprint, LocalDate today) {
        List<Task> inSprint = tasks.findBySprintId(sprint.getId());
        int open = inSprint.stream()
                .filter(task -> !task.isDone())
                .mapToInt(Task::points)
                .sum();
        int committed = sprint.getCommittedPoints() != null
                ? sprint.getCommittedPoints()
                : inSprint.stream().mapToInt(Task::points).sum();
        int end = sprint.getStatus() == SprintStatus.CLOSED && sprint.getCompletedPoints() != null
                ? Math.max(0, committed - sprint.getCompletedPoints())
                : open;
        LocalDate last = sprint.getEndDate().isBefore(today) ? sprint.getEndDate() : today;
        long length = Math.max(1, ChronoUnit.DAYS.between(sprint.getStartDate(), last));
        for (LocalDate day = sprint.getStartDate(); !day.isAfter(last); day = day.plusDays(1)) {
            double progress = Math.pow(ChronoUnit.DAYS.between(sprint.getStartDate(), day) / (double) length, 1.3);
            int remaining = (int) Math.round(committed - (committed - end) * progress);
            days.upsert(UUID.randomUUID(), organizationId, sprint.getId(), day, Math.max(end, remaining));
        }
    }
}
