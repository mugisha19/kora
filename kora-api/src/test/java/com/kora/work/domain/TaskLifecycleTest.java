package com.kora.work.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.ProblemException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class TaskLifecycleTest {

    private static final Instant NOW = Instant.parse("2026-09-27T08:00:00Z");

    @ParameterizedTest(name = "{0} → {1}: {2}")
    @CsvSource({
        "BACKLOG, TODO, true",
        "BACKLOG, IN_PROGRESS, false",
        "TODO, IN_PROGRESS, true",
        "TODO, BACKLOG, true",
        "TODO, DONE, false",
        "IN_PROGRESS, IN_REVIEW, true",
        "IN_PROGRESS, DONE, false",
        "IN_PROGRESS, BLOCKED, true",
        "BLOCKED, IN_PROGRESS, true",
        "BLOCKED, DONE, false",
        "IN_REVIEW, DONE, true",
        "IN_REVIEW, TODO, false",
        "DONE, TODO, true",
        "DONE, IN_PROGRESS, false",
        "IN_REVIEW, IN_REVIEW, true"
    })
    void followsTheDocumentedLifecycle(TaskStatus from, TaskStatus to, boolean allowed) {
        assertThat(from.canMoveTo(to)).isEqualTo(allowed);
    }

    @Test
    void aNewTaskGetsItsKeyAndStartsInTheBacklog() {
        Task task = task(TaskStatus.BACKLOG);

        assertThat(task.getKey()).isEqualTo("AKG-12-7");
        assertThat(task.getPriority()).isEqualTo(TaskPriority.MEDIUM);
        assertThat(task.getLabels()).isEmpty();
    }

    @Test
    void aNewTaskCanOnlyStartInTheBacklogOrToDo() {
        assertThatThrownBy(() -> task(TaskStatus.IN_PROGRESS)).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void anIllegalMoveIsAConflict() {
        Task task = task(TaskStatus.TODO);

        assertThatThrownBy(() -> task.moveTo(TaskStatus.DONE, null, true, NOW))
                .isInstanceOf(ConflictException.class)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("tasks.invalid_transition");
    }

    @Test
    void blockingNeedsAReasonAndUnblockingForgetsIt() {
        Task task = task(TaskStatus.TODO);
        assertThatThrownBy(() -> task.moveTo(TaskStatus.BLOCKED, " ", false, NOW))
                .isInstanceOf(InvalidInputException.class);

        task.moveTo(TaskStatus.BLOCKED, " Waiting for the API keys ", false, NOW);
        assertThat(task.getBlockedReason()).isEqualTo("Waiting for the API keys");

        task.moveTo(TaskStatus.IN_PROGRESS, null, false, NOW);
        assertThat(task.getBlockedReason()).isNull();
    }

    @Test
    void finishingNeedsNoRemainingWork() {
        Task task = inReview();
        task.estimate(null, new BigDecimal("8"), new BigDecimal("1.5"));

        assertThatThrownBy(() -> task.moveTo(TaskStatus.DONE, null, false, NOW))
                .isInstanceOf(ConflictException.class)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("tasks.remaining_work");

        task.estimate(null, null, BigDecimal.ZERO);
        task.moveTo(TaskStatus.DONE, null, false, NOW);
        assertThat(task.isDone()).isTrue();
        assertThat(task.getCompletedAt()).isEqualTo(NOW);
    }

    @Test
    void onlyManagersReopenFinishedWork() {
        Task task = inReview();
        task.moveTo(TaskStatus.DONE, null, false, NOW);

        assertThatThrownBy(() -> task.moveTo(TaskStatus.TODO, null, false, NOW)).isInstanceOf(ForbiddenException.class);

        task.moveTo(TaskStatus.TODO, null, true, NOW);
        assertThat(task.getStatus()).isEqualTo(TaskStatus.TODO);
        assertThat(task.getCompletedAt()).isNull();
    }

    @Test
    void labelsAreTrimmedAndDeduplicated() {
        Task task = task(TaskStatus.BACKLOG);
        task.label(List.of("api ", "mobile", "api"));
        assertThat(task.getLabels()).containsExactly("api", "mobile");

        assertThatThrownBy(() -> task.label(List.of("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k")))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    void theDueDateCantBeBeforeTheStart() {
        Task task = task(TaskStatus.BACKLOG);
        task.schedule(LocalDate.of(2026, 10, 1), null);

        assertThatThrownBy(() -> task.schedule(null, LocalDate.of(2026, 9, 30)))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    void contributorsMayChangeOnlyTheirOwnOrUnassignedTasks() {
        Task task = task(TaskStatus.TODO);
        UUID me = UUID.randomUUID();
        assertThat(task.isOpenTo(me)).isTrue();

        task.assign(UUID.randomUUID());
        assertThat(task.isOpenTo(me)).isFalse();

        task.assign(me);
        assertThat(task.isOpenTo(me)).isTrue();
    }

    private static Task inReview() {
        Task task = task(TaskStatus.TODO);
        task.moveTo(TaskStatus.IN_PROGRESS, null, false, NOW);
        task.moveTo(TaskStatus.IN_REVIEW, null, false, NOW);
        return task;
    }

    private static Task task(TaskStatus status) {
        return Task.create(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "AKG-12",
                7,
                "Build the login screen",
                TaskType.STORY,
                status,
                "i",
                NOW);
    }
}
