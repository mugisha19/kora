package com.kora.portfolio.adapter.web;

import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.UserRefJson;
import com.kora.portfolio.Health;
import com.kora.portfolio.domain.Methodology;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Program;
import com.kora.portfolio.domain.ProjectRole;
import com.kora.portfolio.domain.ProjectStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Request and response bodies of the portfolio endpoints, named after their contract schemas. */
final class PortfolioDtos {

    private PortfolioDtos() {}

    // ---- Portfolios and programs --------------------------------------------------------------------------------

    record PortfolioResponse(
            UUID id,
            String name,
            String description,
            List<String> strategicObjectives,
            UserRefJson owner,
            Portfolio.Status status,
            long programCount,
            long projectCount,
            Instant createdAt,
            long version) {}

    record CreatePortfolioRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @Size(max = 2000) String description,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> strategicObjectives,
            UUID ownerId) {}

    record UpdatePortfolioRequest(
            @Size(min = 2, max = 100) String name,
            @Size(max = 2000) String description,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> strategicObjectives,
            UUID ownerId,
            Portfolio.Status status) {}

    record ProgramResponse(
            UUID id,
            UUID portfolioId,
            String name,
            String description,
            UserRefJson manager,
            Program.Status status,
            long projectCount,
            Instant createdAt,
            long version) {}

    record CreateProgramRequest(
            @NotBlank @Size(min = 2, max = 100) String name,
            @Size(max = 2000) String description,
            @NotNull UUID managerId) {}

    record UpdateProgramRequest(
            @Size(min = 2, max = 100) String name,
            @Size(max = 2000) String description,
            UUID managerId,
            Program.Status status) {}

    // ---- Projects -------------------------------------------------------------------------------------------------

    record ProjectResponse(
            UUID id,
            String code,
            String name,
            String description,
            UUID portfolioId,
            UUID programId,
            UserRefJson manager,
            Methodology methodology,
            ProjectStatus status,
            Set<ProjectStatus> allowedTransitions,
            LocalDate startDate,
            LocalDate targetEndDate,
            MoneyJson budget,
            Health health,
            String healthReason,
            boolean healthOverridden,
            Instant createdAt,
            long version) {}

    record CreateProjectRequest(
            @NotBlank @Pattern(regexp = "[A-Z][A-Z0-9-]{1,14}") String code,

            @NotBlank @Size(min = 2, max = 150) String name,
            @Size(max = 4000) String description,
            @NotNull UUID portfolioId,
            UUID programId,
            UUID managerId,
            @NotNull Methodology methodology,
            @NotNull LocalDate startDate,
            @NotNull LocalDate targetEndDate,
            @Valid MoneyJson budget) {}

    record UpdateProjectRequest(
            @Size(min = 2, max = 150) String name,
            @Size(max = 4000) String description,
            UUID programId,
            UUID managerId,
            Methodology methodology,
            LocalDate startDate,
            LocalDate targetEndDate,
            @Valid MoneyJson budget) {}

    record TransitionRequest(
            @NotNull ProjectStatus to, @Size(max = 500) String reason) {}

    record HealthOverrideRequest(
            @NotNull Health health,
            @NotBlank @Size(max = 500) String reason) {}

    record ProjectMemberResponse(
            UUID userId, String fullName, String email, ProjectRole projectRole, Instant addedAt) {}

    record PutProjectMemberRequest(@NotNull ProjectRole projectRole) {}

    // ---- Charter --------------------------------------------------------------------------------------------------

    record ObjectiveJson(
            @NotBlank @Size(max = 500) String text,
            @NotBlank @Size(max = 300) String successMetric) {}

    record MilestoneJson(
            @NotBlank @Size(max = 200) String name, @NotNull LocalDate targetDate) {}

    record CharterContentRequest(
            @Size(max = 4000) String purpose,
            @Size(max = 8000) String businessCase,
            @Size(max = 30) List<@Valid ObjectiveJson> objectives,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> inScope,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> outOfScope,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> assumptions,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> constraints,
            @Size(max = 50) List<@NotBlank @Size(max = 500) String> highLevelRisks,
            @Size(max = 50) List<@Valid MilestoneJson> milestones,
            @Valid MoneyJson summaryBudget,
            UUID sponsorId) {}

    record CharterResponse(
            UUID projectId,
            int versionNumber,
            String status,
            String purpose,
            String businessCase,
            List<ObjectiveJson> objectives,
            List<String> inScope,
            List<String> outOfScope,
            List<String> assumptions,
            List<String> constraints,
            List<String> highLevelRisks,
            List<MilestoneJson> milestones,
            MoneyJson summaryBudget,
            UserRefJson sponsor,
            Instant submittedAt,
            UserRefJson approvedBy,
            Instant approvedAt,
            String returnComment,
            long version) {}

    record ReturnCharterRequest(@NotBlank @Size(max = 2000) String comment) {}
}
