package com.kora.portfolio.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 06: the charter lifecycle and what a charter needs before it can authorize a project. */
class CharterTest {

    private static final Instant NOW = Instant.parse("2026-09-27T10:00:00Z");
    private static final UUID SPONSOR = UUID.randomUUID();

    private final Charter charter = Charter.firstDraft(UUID.randomUUID(), UUID.randomUUID(), NOW);

    private static CharterContent complete() {
        return new CharterContent(
                "Let customers bank from their phones",
                "Branch visits cost 4x a mobile session",
                List.of(new CharterObjective("50,000 active users by Q4", "Monthly active users")),
                List.of("iOS and Android apps"),
                List.of("Web banking"),
                List.of(),
                List.of(),
                List.of("App store rejection"),
                List.of(new CharterMilestone("Beta", LocalDate.of(2026, 11, 1))),
                null,
                SPONSOR);
    }

    @Test
    void startsAsAnEmptyDraftVersionOne() {
        assertThat(charter.getStatus()).isEqualTo(CharterStatus.DRAFT);
        assertThat(charter.getVersionNumber()).isEqualTo(1);
        assertThat(charter.content().objectives()).isEmpty();
    }

    @Test
    void refusesToSubmitWithoutPurposeObjectiveAndSponsor() {
        assertThatThrownBy(() -> charter.submit(UUID.randomUUID(), NOW))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> {
                    ConflictException conflict = (ConflictException) e;
                    assertThat(conflict.code()).isEqualTo("charters.incomplete");
                    assertThat(conflict.violations())
                            .extracting(FieldViolation::field)
                            .containsExactly("purpose", "objectives", "sponsorId");
                });
        assertThat(charter.getStatus()).isEqualTo(CharterStatus.DRAFT);
    }

    @Test
    void goesDraftSubmittedApprovedAndIsThenReadOnly() {
        charter.replaceContent(complete());
        charter.submit(UUID.randomUUID(), NOW);
        charter.approve(SPONSOR, NOW);

        assertThat(charter.getStatus()).isEqualTo(CharterStatus.APPROVED);
        assertThat(charter.getApprovedBy()).isEqualTo(SPONSOR);
        assertThatThrownBy(() -> charter.replaceContent(complete()))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("charters.not_draft");
    }

    @Test
    void aReturnedCharterIsADraftAgainWithTheComment() {
        charter.replaceContent(complete());
        charter.submit(UUID.randomUUID(), NOW);

        charter.returnForChanges("Quantify the business case");

        assertThat(charter.getStatus()).isEqualTo(CharterStatus.DRAFT);
        assertThat(charter.getReturnComment()).isEqualTo("Quantify the business case");
        assertThat(charter.getSubmittedAt()).isNull();
    }

    @Test
    void onlyASubmittedCharterCanBeDecided() {
        assertThatThrownBy(() -> charter.approve(SPONSOR, NOW))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("charters.not_submitted");
        assertThatThrownBy(() -> charter.returnForChanges("no"))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("charters.not_submitted");
    }
}
