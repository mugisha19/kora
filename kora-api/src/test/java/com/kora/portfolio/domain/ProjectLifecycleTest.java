package com.kora.portfolio.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.money.Money;
import com.kora.portfolio.Health;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

/** Feature 04: the project lifecycle (State pattern) and the project's own rules. */
class ProjectLifecycleTest {

    private static Project project() {
        return Project.propose(
                UUID.randomUUID(),
                UUID.randomUUID(),
                null,
                "AKG-012",
                "Mobile banking",
                null,
                UUID.randomUUID(),
                Methodology.AGILE,
                LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 12, 31),
                Money.of("150000000", "RWF"),
                Instant.now());
    }

    private static Project inStatus(ProjectStatus status) {
        Project project = project();
        project.authorizeByCharter();
        switch (status) {
            case PROPOSED -> {
                return project();
            }
            case APPROVED -> {
                return project;
            }
            case IN_PROGRESS -> project.transitionTo(ProjectStatus.IN_PROGRESS, null);
            case ON_HOLD -> {
                project.transitionTo(ProjectStatus.IN_PROGRESS, null);
                project.transitionTo(ProjectStatus.ON_HOLD, "Waiting for the vendor");
            }
            case CLOSING -> {
                project.transitionTo(ProjectStatus.IN_PROGRESS, null);
                project.transitionTo(ProjectStatus.CLOSING, null);
            }
            case CLOSED -> {
                project.transitionTo(ProjectStatus.IN_PROGRESS, null);
                project.transitionTo(ProjectStatus.CLOSING, null);
                project.transitionTo(ProjectStatus.CLOSED, null);
            }
            case CANCELLED -> project.transitionTo(ProjectStatus.CANCELLED, "Budget withdrawn");
            default -> throw new IllegalArgumentException();
        }
        return project;
    }

    @ParameterizedTest(name = "{0} -> {1} allowed: {2}")
    @CsvSource({
        "APPROVED, IN_PROGRESS, true",
        "APPROVED, ON_HOLD, false",
        "IN_PROGRESS, ON_HOLD, true",
        "IN_PROGRESS, CLOSING, true",
        "ON_HOLD, IN_PROGRESS, true",
        "ON_HOLD, CLOSING, false",
        "CLOSING, CLOSED, true",
        "CLOSING, IN_PROGRESS, false",
        "CLOSED, IN_PROGRESS, false",
        "CANCELLED, IN_PROGRESS, false",
        "PROPOSED, IN_PROGRESS, false"
    })
    void followsTheStateMachine(ProjectStatus from, ProjectStatus to, boolean allowed) {
        Project project = inStatus(from);
        if (allowed) {
            project.transitionTo(to, "reason");
            assertThat(project.getStatus()).isEqualTo(to);
        } else {
            assertThatThrownBy(() -> project.transitionTo(to, "reason"))
                    .isInstanceOf(ConflictException.class)
                    .extracting("code")
                    .isEqualTo("projects.invalid_transition");
        }
    }

    @ParameterizedTest
    @EnumSource(
            value = ProjectStatus.class,
            names = {"PROPOSED", "APPROVED", "IN_PROGRESS", "ON_HOLD", "CLOSING"})
    void anyOpenProjectCanBeCancelledWithAReason(ProjectStatus from) {
        Project project = inStatus(from);

        project.transitionTo(ProjectStatus.CANCELLED, "Strategy changed");

        assertThat(project.getStatus()).isEqualTo(ProjectStatus.CANCELLED);
        assertThat(project.manualTransitions()).isEmpty();
    }

    @Test
    void approvalComesOnlyFromTheCharter() {
        Project project = project();

        assertThatThrownBy(() -> project.transitionTo(ProjectStatus.APPROVED, null))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("projects.charter_approval_required");
        assertThat(project.manualTransitions()).containsExactly(ProjectStatus.CANCELLED);

        project.authorizeByCharter();
        assertThat(project.getStatus()).isEqualTo(ProjectStatus.APPROVED);
        assertThat(project.manualTransitions())
                .containsExactlyInAnyOrder(ProjectStatus.IN_PROGRESS, ProjectStatus.CANCELLED);
    }

    @Test
    void pausingAndCancellingNeedAReason() {
        Project project = inStatus(ProjectStatus.IN_PROGRESS);

        assertThatThrownBy(() -> project.transitionTo(ProjectStatus.ON_HOLD, "  "))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> project.transitionTo(ProjectStatus.CANCELLED, null))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    void theMethodologyIsFixedOnceApproved() {
        Project project = project();
        project.changeMethodology(Methodology.HYBRID);
        project.authorizeByCharter();

        assertThatThrownBy(() -> project.changeMethodology(Methodology.PREDICTIVE))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("projects.methodology_locked");
    }

    @Test
    void endsAfterItStarts() {
        assertThatThrownBy(() -> project().reschedule(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 1)))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    void anOverrideWinsUntilClearedAndGreyIsNeverChosen() {
        Project project = project();
        project.recordComputedHealth(Health.GREEN, "On track");

        project.overrideHealth(Health.RED, "Key supplier went bankrupt");
        assertThat(project.effectiveHealth()).isEqualTo(Health.RED);
        assertThat(project.recordComputedHealth(Health.AMBER, "Late"))
                .as("hidden by the override")
                .isFalse();

        project.clearHealthOverride();
        assertThat(project.effectiveHealth()).isEqualTo(Health.AMBER);
        assertThatThrownBy(() -> project.overrideHealth(Health.GREY, "why")).isInstanceOf(InvalidInputException.class);
    }
}
