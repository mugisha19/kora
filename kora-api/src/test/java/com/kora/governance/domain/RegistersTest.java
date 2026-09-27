package com.kora.governance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.ProblemException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Features 11–13: risk scoring and responses, the issue lifecycle, stakeholder grid and erasure. */
class RegistersTest {

    private static final Instant NOW = Instant.parse("2026-09-27T08:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 9, 27);

    @ParameterizedTest(name = "score {0} is {1}")
    @CsvSource({"1, LOW", "4, LOW", "5, MEDIUM", "9, MEDIUM", "10, HIGH", "14, HIGH", "15, CRITICAL", "25, CRITICAL"})
    void scoresFallIntoTheDocumentedBands(int score, Severity severity) {
        assertThat(Severity.of(score)).isEqualTo(severity);
    }

    @Test
    void aStrategyMustSuitTheKindOfRisk() {
        Risk threat = risk(RiskKind.THREAT, 3, 3);
        Risk opportunity = risk(RiskKind.OPPORTUNITY, 3, 3);

        assertThatThrownBy(() -> threat.planResponse(ResponseStrategy.EXPLOIT, null))
                .isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> opportunity.planResponse(ResponseStrategy.MITIGATE, null))
                .isInstanceOf(InvalidInputException.class);
        threat.planResponse(ResponseStrategy.ACCEPT, "Budget a contingency");
        opportunity.planResponse(ResponseStrategy.ACCEPT, "Take it if it comes");
        assertThat(threat.getResponseStrategy()).isEqualTo(ResponseStrategy.ACCEPT);
    }

    @Test
    void aPlannedResponseNeedsAStrategyAndAPlan() {
        Risk risk = risk(RiskKind.THREAT, 2, 2);

        assertThatThrownBy(() -> risk.moveTo(RiskStatus.RESPONSE_PLANNED)).isInstanceOf(InvalidInputException.class);
        risk.planResponse(ResponseStrategy.MITIGATE, "Second supplier");
        risk.moveTo(RiskStatus.RESPONSE_PLANNED);
        assertThat(risk.getStatus()).isEqualTo(RiskStatus.RESPONSE_PLANNED);
    }

    @Test
    void assessingAnalysesTheRiskAndClosingFreezesIt() {
        Risk risk = risk(RiskKind.THREAT, 2, 2);
        risk.assess(4, 5, 2, 3);

        assertThat(risk.getStatus()).isEqualTo(RiskStatus.ANALYZED);
        assertThat(risk.score()).isEqualTo(20);
        assertThat(risk.residualScore()).isEqualTo(6);
        assertThatThrownBy(() -> risk.assess(6, 1, null, null)).isInstanceOf(InvalidInputException.class);

        risk.close(RiskClosure.EXPIRED, "The vendor delivered");
        assertThatThrownBy(() -> risk.retitle("Too late"))
                .isInstanceOf(ConflictException.class)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("risks.closed");
    }

    @Test
    void aCriticalRiskCountsAgainstHealthWhenUnplannedForAWeekOrPastItsReview() {
        Risk critical = risk(RiskKind.THREAT, 5, 4);
        assertThat(critical.isCriticalAndOverdue(TODAY.plusDays(7), ZoneOffset.UTC))
                .isFalse();
        assertThat(critical.isCriticalAndOverdue(TODAY.plusDays(8), ZoneOffset.UTC))
                .isTrue();

        critical.planResponse(ResponseStrategy.MITIGATE, "Hire a second DBA");
        assertThat(critical.isCriticalAndOverdue(TODAY.plusDays(8), ZoneOffset.UTC))
                .isFalse();
        critical.reviewOn(TODAY.plusDays(3));
        assertThat(critical.isCriticalAndOverdue(TODAY.plusDays(4), ZoneOffset.UTC))
                .isTrue();
        assertThat(risk(RiskKind.THREAT, 3, 4).isCriticalAndOverdue(TODAY.plusDays(30), ZoneOffset.UTC))
                .isFalse();
    }

    @Test
    void issuesFollowTheirLifecycle() {
        Issue issue = Issue.raise(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "AKG-I1",
                1,
                "Build server down",
                IssueType.TECHNICAL,
                IssuePriority.CRITICAL,
                UUID.randomUUID(),
                null,
                NOW);
        issue.dueOn(TODAY.minusDays(1));
        assertThat(issue.isOverdue(TODAY)).isTrue();
        assertThat(issue.isEscalated(NOW.plusSeconds(3 * 86_400 + 1))).isTrue();
        assertThatThrownBy(issue::close)
                .extracting(error -> ((ProblemException) error).code())
                .isEqualTo("issues.invalid_transition");

        issue.work(IssueStatus.IN_PROGRESS);
        issue.resolve("Replaced the disk", NOW);
        assertThat(issue.isOverdue(TODAY)).isFalse();
        assertThat(issue.isEscalated(NOW.plusSeconds(10 * 86_400))).isFalse();
        assertThatThrownBy(() -> issue.retitle("Edit")).isInstanceOf(ConflictException.class);

        issue.close();
        issue.reopen();
        assertThat(issue.getStatus()).isEqualTo(IssueStatus.OPEN);
        assertThat(issue.getResolution()).isNull();
    }

    @ParameterizedTest(name = "power {0}, interest {1}: {2}")
    @CsvSource({
        "5, 5, MANAGE_CLOSELY",
        "3, 3, MANAGE_CLOSELY",
        "4, 2, KEEP_SATISFIED",
        "2, 4, KEEP_INFORMED",
        "2, 2, MONITOR",
        "1, 1, MONITOR"
    })
    void stakeholdersFallIntoThePowerInterestQuadrants(int power, int interest, StakeholderQuadrant quadrant) {
        assertThat(StakeholderQuadrant.of(power, interest)).isEqualTo(quadrant);
    }

    @Test
    void removingAStakeholderErasesTheirPersonalData() {
        Stakeholder stakeholder = Stakeholder.identify(
                UUID.randomUUID(), UUID.randomUUID(), "Alice Uwase", 4, 5, Engagement.NEUTRAL, Engagement.LEADING);
        stakeholder.contact("alice@example.com", "+250 788 000 000", UUID.randomUUID());
        stakeholder.describe("Bank of Kigali", "CFO");
        stakeholder.note("Email on Mondays", "Prefers numbers");
        assertThat(stakeholder.engagementGap()).isEqualTo(2);

        stakeholder.remove();

        assertThat(stakeholder.getName()).isEqualTo(Stakeholder.REMOVED_NAME);
        assertThat(stakeholder.getEmail()).isNull();
        assertThat(stakeholder.getPhone()).isNull();
        assertThat(stakeholder.getUserId()).isNull();
        assertThat(stakeholder.getOrganization()).isNull();
        assertThat(stakeholder.getRole()).isNull();
        assertThat(stakeholder.getNotes()).isNull();
        assertThat(stakeholder.getCommunicationPreferences()).isNull();
        assertThat(stakeholder.isRemoved()).isTrue();
        assertThat(stakeholder.getPower()).isEqualTo(4);
    }

    private static Risk risk(RiskKind kind, int probability, int impact) {
        return Risk.raise(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "AKG-R1",
                1,
                "Vendor delay",
                kind,
                RiskCategory.EXTERNAL,
                probability,
                impact,
                UUID.randomUUID(),
                NOW);
    }
}
