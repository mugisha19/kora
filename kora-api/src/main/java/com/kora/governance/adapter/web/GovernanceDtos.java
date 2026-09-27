package com.kora.governance.adapter.web;

import com.kora.governance.domain.ApprovalLevel;
import com.kora.governance.domain.ChangeRequestStatus;
import com.kora.governance.domain.ChangeRequestType;
import com.kora.governance.domain.Decision;
import com.kora.governance.domain.Engagement;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import com.kora.governance.domain.IssueType;
import com.kora.governance.domain.ResponseStrategy;
import com.kora.governance.domain.RiskCategory;
import com.kora.governance.domain.RiskClosure;
import com.kora.governance.domain.RiskKind;
import com.kora.governance.domain.RiskProximity;
import com.kora.governance.domain.RiskStatus;
import com.kora.governance.domain.Severity;
import com.kora.governance.domain.StakeholderQuadrant;
import com.kora.governance.domain.StepState;
import com.kora.organization.Role;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.UserRefJson;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request and response bodies of the contract tags {@code Risks}, {@code Issues}, {@code Stakeholders} and {@code ChangeRequests}. */
final class GovernanceDtos {

    static final String PHONE = "[+0-9 ()-]{3,40}";

    private GovernanceDtos() {}

    // ---- Risks ----------------------------------------------------------------------------------------------------

    record RiskResponse(
            UUID id,
            String key,
            UUID projectId,
            String title,
            String description,
            RiskCategory category,
            RiskProximity proximity,
            UUID ownerId,
            ResponseStrategy responseStrategy,
            String responsePlan,
            String triggerConditions,
            LocalDate reviewDate,
            RiskKind kind,
            RiskStatus status,
            int probability,
            int impact,
            int score,
            Severity severity,
            Integer residualProbability,
            Integer residualImpact,
            Integer residualScore,
            UserRefJson owner,
            UserRefJson identifiedBy,
            boolean reviewOverdue,
            RiskClosure closure,
            String closureNote,
            UUID issueId,
            Instant createdAt,
            long version) {}

    record CreateRiskRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 4000) String description,
            @NotNull RiskKind kind,
            @NotNull RiskCategory category,
            RiskProximity proximity,
            @NotNull @Min(1) @Max(5) Integer probability,
            @NotNull @Min(1) @Max(5) Integer impact,
            UUID ownerId,
            ResponseStrategy responseStrategy,
            @Size(max = 4000) String responsePlan,
            @Size(max = 2000) String triggerConditions,
            LocalDate reviewDate) {}

    record UpdateRiskRequest(
            @Size(min = 1, max = 200) String title,
            @Size(max = 4000) String description,
            RiskCategory category,
            RiskProximity proximity,
            UUID ownerId,
            ResponseStrategy responseStrategy,
            @Size(max = 4000) String responsePlan,
            @Size(max = 2000) String triggerConditions,
            LocalDate reviewDate,
            RiskStatus status) {}

    record RiskAssessmentResponse(
            UUID id,
            int probability,
            int impact,
            int score,
            Integer residualProbability,
            Integer residualImpact,
            String note,
            UserRefJson assessedBy,
            Instant assessedAt) {}

    record AssessRiskRequest(
            @NotNull @Min(1) @Max(5) Integer probability,
            @NotNull @Min(1) @Max(5) Integer impact,
            @Min(1) @Max(5) Integer residualProbability,
            @Min(1) @Max(5) Integer residualImpact,
            @Size(max = 1000) String note) {}

    record CloseRiskRequest(@NotBlank @Size(max = 1000) String note) {}

    record MaterializeRiskRequest(
            @Size(min = 1, max = 200) String title, IssuePriority priority, UUID ownerId, LocalDate dueDate) {}

    record RiskHeatmapCellResponse(
            int probability, int impact, int score, Severity severity, int count, List<UUID> riskIds) {}

    record RiskHeatmapResponse(UUID projectId, List<RiskHeatmapCellResponse> cells) {}

    // ---- Issues ---------------------------------------------------------------------------------------------------

    record IssueResponse(
            UUID id,
            String key,
            UUID projectId,
            String title,
            String description,
            IssueType type,
            IssuePriority priority,
            IssueStatus status,
            UserRefJson owner,
            UserRefJson raisedBy,
            LocalDate dueDate,
            String resolution,
            Instant resolvedAt,
            UUID riskId,
            UUID changeRequestId,
            boolean overdue,
            boolean escalated,
            Instant createdAt,
            long version) {}

    record CreateIssueRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 4000) String description,
            @NotNull IssueType type,
            @NotNull IssuePriority priority,
            UUID ownerId,
            LocalDate dueDate) {}

    record UpdateIssueRequest(
            @Size(min = 1, max = 200) String title,
            @Size(max = 4000) String description,
            IssueType type,
            IssuePriority priority,
            UUID ownerId,
            LocalDate dueDate,
            IssueStatus status) {}

    record ResolveIssueRequest(@NotBlank @Size(max = 4000) String resolution) {}

    record ReopenIssueRequest(@NotBlank @Size(max = 1000) String reason) {}

    // ---- Stakeholders ---------------------------------------------------------------------------------------------

    record StakeholderResponse(
            UUID id,
            UUID projectId,
            String name,
            String organization,
            String role,
            String email,
            String phone,
            UUID userId,
            int power,
            int interest,
            Integer influence,
            Engagement currentEngagement,
            Engagement desiredEngagement,
            int engagementGap,
            StakeholderQuadrant quadrant,
            String communicationPreferences,
            String notes,
            boolean removed,
            long version) {}

    record CreateStakeholderRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 200) String organization,
            @Size(max = 200) String role,
            @Email @Size(max = 254) String email,
            @Pattern(regexp = PHONE) String phone,
            UUID userId,
            @NotNull @Min(1) @Max(5) Integer power,
            @NotNull @Min(1) @Max(5) Integer interest,
            @Min(1) @Max(5) Integer influence,
            @NotNull Engagement currentEngagement,
            @NotNull Engagement desiredEngagement,
            @Size(max = 1000) String communicationPreferences,
            @Size(max = 4000) String notes) {}

    record UpdateStakeholderRequest(
            @Size(min = 1, max = 200) String name,
            @Size(max = 200) String organization,
            @Size(max = 200) String role,
            @Email @Size(max = 254) String email,
            @Pattern(regexp = PHONE) String phone,
            UUID userId,
            @Min(1) @Max(5) Integer power,
            @Min(1) @Max(5) Integer interest,
            @Min(1) @Max(5) Integer influence,
            Engagement currentEngagement,
            Engagement desiredEngagement,
            @Size(max = 1000) String communicationPreferences,
            @Size(max = 4000) String notes) {}

    record StakeholderGridEntryResponse(UUID id, String name, int power, int interest, int engagementGap) {}

    record StakeholderGridQuadrantResponse(
            StakeholderQuadrant quadrant, List<StakeholderGridEntryResponse> stakeholders) {}

    record StakeholderGridResponse(UUID projectId, List<StakeholderGridQuadrantResponse> quadrants) {}

    // ---- Change requests ------------------------------------------------------------------------------------------

    record ImpactJson(
            @Valid MoneyJson costDelta,
            @Min(-1000) @Max(1000) Integer scheduleDeltaDays,
            @Size(max = 2000) String scopeSummary,
            @Size(max = 2000) String riskSummary,
            Boolean changesCharterScope) {}

    record ApprovalStepResponse(
            int position,
            ApprovalLevel level,
            String reason,
            UserRefJson approver,
            Role approverRole,
            StepState state,
            UserRefJson decidedBy,
            String comment,
            Instant decidedAt) {}

    record ChangeRequestResponse(
            UUID id,
            String key,
            int revision,
            UUID projectId,
            String title,
            String description,
            String reason,
            ChangeRequestType type,
            ChangeRequestStatus status,
            ImpactJson impact,
            UserRefJson requestedBy,
            UUID issueId,
            UUID previousRevisionId,
            List<ApprovalStepResponse> steps,
            Instant submittedAt,
            Instant decidedAt,
            Instant createdAt,
            long version) {}

    record CreateChangeRequestRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 4000) String description,
            @NotBlank @Size(max = 2000) String reason,
            @NotNull ChangeRequestType type,
            @Valid ImpactJson impact,
            UUID issueId) {}

    record UpdateChangeRequestRequest(
            @Size(min = 1, max = 200) String title,
            @Size(max = 4000) String description,
            @Size(min = 1, max = 2000) String reason,
            ChangeRequestType type,
            @Valid ImpactJson impact) {}

    record DecisionRequest(
            @NotNull Decision decision, @Size(max = 2000) String comment) {}

    record ChangeControlSettingsResponse(
            BigDecimal pmoCostPercent, int pmoScheduleDays, BigDecimal sponsorCostPercent, long version) {}

    record UpdateChangeControlSettingsRequest(
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal pmoCostPercent,
            @NotNull @Min(0) @Max(1000) Integer pmoScheduleDays,
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal sponsorCostPercent) {}
}
