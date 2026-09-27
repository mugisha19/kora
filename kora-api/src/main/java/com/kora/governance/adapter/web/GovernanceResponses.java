package com.kora.governance.adapter.web;

import com.kora.governance.domain.ApprovalStep;
import com.kora.governance.domain.ChangeRequest;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskAssessment;
import com.kora.governance.domain.Stakeholder;
import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.UserRefJson;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Turns governance records into responses: people named in one lookup per page, and the flags that depend on
 * today (overdue review, overdue, escalated) computed in the organization's time zone.
 */
@Component
class GovernanceResponses {

    private final MemberDirectory members;
    private final UserAccounts accounts;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    GovernanceResponses(MemberDirectory members, UserAccounts accounts, OrganizationTimeZone timeZone, Clock clock) {
        this.members = members;
        this.accounts = accounts;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    List<GovernanceDtos.RiskResponse> risks(List<Risk> risks) {
        Map<UUID, String> names = names(risks.stream()
                .flatMap(risk -> java.util.stream.Stream.of(risk.getOwnerId(), risk.getIdentifiedBy()))
                .toList());
        LocalDate today = today();
        return risks.stream().map(risk -> risk(risk, names, today)).toList();
    }

    GovernanceDtos.RiskResponse risk(Risk risk) {
        return risks(List.of(risk)).getFirst();
    }

    List<GovernanceDtos.RiskAssessmentResponse> assessments(List<RiskAssessment> assessments) {
        Map<UUID, String> names =
                names(assessments.stream().map(RiskAssessment::getAssessedBy).toList());
        return assessments.stream()
                .map(assessment -> new GovernanceDtos.RiskAssessmentResponse(
                        assessment.getId(),
                        assessment.getProbability(),
                        assessment.getImpact(),
                        assessment.score(),
                        assessment.getResidualProbability(),
                        assessment.getResidualImpact(),
                        assessment.getNote(),
                        ref(assessment.getAssessedBy(), names),
                        assessment.getAssessedAt()))
                .toList();
    }

    List<GovernanceDtos.IssueResponse> issues(List<Issue> issues) {
        Map<UUID, String> names = names(issues.stream()
                .flatMap(issue -> java.util.stream.Stream.of(issue.getOwnerId(), issue.getRaisedBy()))
                .toList());
        LocalDate today = today();
        Instant now = clock.instant();
        return issues.stream()
                .map(issue -> new GovernanceDtos.IssueResponse(
                        issue.getId(),
                        issue.getKey(),
                        issue.getProjectId(),
                        issue.getTitle(),
                        issue.getDescription(),
                        issue.getType(),
                        issue.getPriority(),
                        issue.getStatus(),
                        ref(issue.getOwnerId(), names),
                        ref(issue.getRaisedBy(), names),
                        issue.getDueDate(),
                        issue.getResolution(),
                        issue.getResolvedAt(),
                        issue.getRiskId(),
                        issue.getChangeRequestId(),
                        issue.isOverdue(today),
                        issue.isEscalated(now),
                        issue.getCreatedAt(),
                        issue.getVersion()))
                .toList();
    }

    GovernanceDtos.IssueResponse issue(Issue issue) {
        return issues(List.of(issue)).getFirst();
    }

    static GovernanceDtos.StakeholderResponse stakeholder(Stakeholder stakeholder) {
        return new GovernanceDtos.StakeholderResponse(
                stakeholder.getId(),
                stakeholder.getProjectId(),
                stakeholder.getName(),
                stakeholder.getOrganization(),
                stakeholder.getRole(),
                stakeholder.getEmail(),
                stakeholder.getPhone(),
                stakeholder.getUserId(),
                stakeholder.getPower(),
                stakeholder.getInterest(),
                stakeholder.getInfluence(),
                stakeholder.getCurrentEngagement(),
                stakeholder.getDesiredEngagement(),
                stakeholder.engagementGap(),
                stakeholder.quadrant(),
                stakeholder.getCommunicationPreferences(),
                stakeholder.getNotes(),
                stakeholder.isRemoved(),
                stakeholder.getVersion());
    }

    List<GovernanceDtos.ChangeRequestResponse> changeRequests(List<ChangeRequest> requests) {
        List<UUID> people = new ArrayList<>();
        for (ChangeRequest request : requests) {
            people.add(request.getRequestedBy());
            request.getSteps().forEach(step -> {
                people.add(step.getApproverId());
                people.add(step.getDecidedBy());
            });
        }
        Map<UUID, String> names = names(people);
        return requests.stream().map(request -> changeRequest(request, names)).toList();
    }

    GovernanceDtos.ChangeRequestResponse changeRequest(ChangeRequest request) {
        return changeRequests(List.of(request)).getFirst();
    }

    private static GovernanceDtos.ChangeRequestResponse changeRequest(ChangeRequest request, Map<UUID, String> names) {
        ChangeRequest.Impact impact = request.impact();
        return new GovernanceDtos.ChangeRequestResponse(
                request.getId(),
                request.getKey(),
                request.getRevision(),
                request.getProjectId(),
                request.getTitle(),
                request.getDescription(),
                request.getReason(),
                request.getType(),
                request.getStatus(),
                new GovernanceDtos.ImpactJson(
                        MoneyJson.from(impact.costDelta()),
                        impact.scheduleDeltaDays(),
                        impact.scopeSummary(),
                        impact.riskSummary(),
                        impact.changesCharterScope()),
                ref(request.getRequestedBy(), names),
                request.getIssueId(),
                request.getPreviousRevisionId(),
                request.getSteps().stream().map(step -> step(step, names)).toList(),
                request.getSubmittedAt(),
                request.getDecidedAt(),
                request.getCreatedAt(),
                request.getVersion());
    }

    private static GovernanceDtos.ApprovalStepResponse step(ApprovalStep step, Map<UUID, String> names) {
        return new GovernanceDtos.ApprovalStepResponse(
                step.getPosition(),
                step.getLevel(),
                step.getReason(),
                ref(step.getApproverId(), names),
                step.getApproverRole(),
                step.getState(),
                ref(step.getDecidedBy(), names),
                step.getComment(),
                step.getDecidedAt());
    }

    private static GovernanceDtos.RiskResponse risk(Risk risk, Map<UUID, String> names, LocalDate today) {
        return new GovernanceDtos.RiskResponse(
                risk.getId(),
                risk.getKey(),
                risk.getProjectId(),
                risk.getTitle(),
                risk.getDescription(),
                risk.getCategory(),
                risk.getProximity(),
                risk.getOwnerId(),
                risk.getResponseStrategy(),
                risk.getResponsePlan(),
                risk.getTriggerConditions(),
                risk.getReviewDate(),
                risk.getKind(),
                risk.getStatus(),
                risk.getProbability(),
                risk.getImpact(),
                risk.score(),
                risk.severity(),
                risk.getResidualProbability(),
                risk.getResidualImpact(),
                risk.residualScore(),
                ref(risk.getOwnerId(), names),
                ref(risk.getIdentifiedBy(), names),
                risk.isReviewOverdue(today),
                risk.getClosure(),
                risk.getClosureNote(),
                risk.getIssueId(),
                risk.getCreatedAt(),
                risk.getVersion());
    }

    private static UserRefJson ref(UUID userId, Map<UUID, String> names) {
        return userId == null ? null : new UserRefJson(userId, names.get(userId));
    }

    /**
     * Full names in one query for current members; someone who has left keeps their name on what they raised or
     * decided, looked up in their account.
     */
    private Map<UUID, String> names(Collection<UUID> userIds) {
        List<UUID> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, String> names = new HashMap<>();
        members.findAll(ids).forEach((id, member) -> names.put(id, member.fullName()));
        for (UUID id : ids) {
            names.computeIfAbsent(id, missing -> accounts.get(missing).fullName());
        }
        return names;
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(timeZone.zone()));
    }
}
