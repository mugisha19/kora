package com.kora.work.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.ProblemException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 09: the sprint lifecycle, the burndown, velocity, and task-based work package progress (feature 08). */
class SprintMetricsTest {

    private static final Instant NOW = Instant.parse("2026-09-27T08:00:00Z");
    private static final LocalDate MONDAY = LocalDate.of(2026, 9, 28);

    @Test
    void aSprintRunsOnceFromPlannedToClosed() {
        Sprint sprint = sprint(MONDAY, MONDAY.plusDays(9));

        assertThatThrownBy(() -> sprint.close(0)).isInstanceOf(ConflictException.class);
        sprint.start(21);
        assertThat(sprint.getCommittedPoints()).isEqualTo(21);
        assertThatThrownBy(() -> sprint.start(30))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("sprints.not_planned");

        sprint.close(18);
        assertThat(sprint.getCompletedPoints()).isEqualTo(18);
        assertThatThrownBy(() -> sprint.rename("Sprint 5"))
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("sprints.closed");
    }

    @Test
    void aSprintEndsOnOrAfterItsStart() {
        assertThatThrownBy(() -> sprint(MONDAY, MONDAY.minusDays(1))).isInstanceOf(InvalidInputException.class);
        assertThat(sprint(MONDAY, MONDAY).getEndDate()).isEqualTo(MONDAY);
    }

    @Test
    void theBurndownComparesRecordedDaysWithAnEvenIdealLine() {
        Sprint sprint = sprint(MONDAY, MONDAY.plusDays(4));
        sprint.start(20);
        List<SprintDayProgress> recorded = List.of(
                day(sprint, MONDAY, 20), day(sprint, MONDAY.plusDays(1), 16), day(sprint, MONDAY.plusDays(3), 9));

        Burndown burndown = Burndown.of(sprint, 20, recorded, MONDAY.plusDays(3));

        assertThat(burndown.days())
                .extracting(Burndown.Day::idealRemaining)
                .containsExactly(
                        new BigDecimal("20.00"),
                        new BigDecimal("15.00"),
                        new BigDecimal("10.00"),
                        new BigDecimal("5.00"),
                        new BigDecimal("0.00"));
        // Day 3 had no change and keeps day 2's value; day 5 is still in the future.
        assertThat(burndown.days()).extracting(Burndown.Day::actualRemaining).containsExactly(20, 16, 16, 9, null);
    }

    @Test
    void aPlannedSprintHasNoActualLine() {
        Sprint sprint = sprint(MONDAY, MONDAY.plusDays(1));

        assertThat(Burndown.of(sprint, 5, List.of(), MONDAY.plusDays(1)).days())
                .extracting(Burndown.Day::actualRemaining)
                .containsOnlyNulls();
    }

    @Test
    void velocityAveragesTheClosedSprintsAndGivesTheRange() {
        Velocity velocity = Velocity.of(List.of(closed(20, 18), closed(20, 24), closed(25, 21)));

        assertThat(velocity.average()).isEqualByComparingTo("21");
        assertThat(velocity.low()).isEqualTo(18);
        assertThat(velocity.high()).isEqualTo(24);
        assertThat(Velocity.of(List.of()).average()).isNull();
    }

    @Test
    void workPackageProgressIsWeightedByEstimate() {
        Task done = task(new BigDecimal("30"), null);
        done.moveTo(TaskStatus.IN_PROGRESS, null, false, NOW);
        done.moveTo(TaskStatus.IN_REVIEW, null, false, NOW);
        done.moveTo(TaskStatus.DONE, null, false, NOW);
        Task halfway = task(new BigDecimal("10"), new BigDecimal("5"));
        Task unestimated = task(null, null);

        // (30 × 100 + 10 × 50 + 1 × 0) / 41
        assertThat(TaskProgressRule.percentComplete(List.of(done, halfway, unestimated)))
                .isEqualByComparingTo("85.37");
        assertThat(TaskProgressRule.percentComplete(List.of(unestimated))).isEqualByComparingTo("0");
    }

    @Test
    void remainingAboveTheEstimateMeansNoProgressYet() {
        assertThat(TaskProgressRule.percent(task(new BigDecimal("4"), new BigDecimal("6"))))
                .isEqualByComparingTo("0");
    }

    private static Task task(BigDecimal estimate, BigDecimal remaining) {
        Task task = Task.create(
                UUID.randomUUID(), UUID.randomUUID(), "AKG", 1, "Task", TaskType.TASK, TaskStatus.TODO, "i", NOW);
        task.estimate(null, estimate, remaining);
        return task;
    }

    private static Sprint closed(int committed, int completed) {
        Sprint sprint = sprint(MONDAY, MONDAY.plusDays(13));
        sprint.start(committed);
        sprint.close(completed);
        return sprint;
    }

    private static Sprint sprint(LocalDate start, LocalDate end) {
        return Sprint.plan(UUID.randomUUID(), UUID.randomUUID(), "Sprint 4", "Checkout", start, end, NOW);
    }

    private static SprintDayProgress day(Sprint sprint, LocalDate date, int points) {
        return SprintDayProgress.of(UUID.randomUUID(), sprint.getId(), date, points);
    }
}
