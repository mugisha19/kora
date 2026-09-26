package com.kora.portfolio.adapter.web;

import com.kora.organization.OrganizationCurrency;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.PageResponse;
import com.kora.portfolio.Health;
import com.kora.portfolio.adapter.web.PortfolioDtos.CreateProjectRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.HealthOverrideRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.ProjectMemberResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.ProjectResponse;
import com.kora.portfolio.adapter.web.PortfolioDtos.PutProjectMemberRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.TransitionRequest;
import com.kora.portfolio.adapter.web.PortfolioDtos.UpdateProjectRequest;
import com.kora.portfolio.application.PortfolioRepositories.ProjectSearch;
import com.kora.portfolio.application.ProjectService;
import com.kora.portfolio.application.ProjectService.NewProject;
import com.kora.portfolio.application.ProjectService.ProjectChanges;
import com.kora.portfolio.application.ProjectService.TeamMember;
import com.kora.portfolio.domain.Methodology;
import com.kora.portfolio.domain.Project;
import com.kora.portfolio.domain.ProjectRole;
import com.kora.portfolio.domain.ProjectStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Projects}. */
@RestController
@RequestMapping("/api/v1/projects")
class ProjectsController {

    private final ProjectService projects;
    private final PortfolioResponses responses;
    private final OrganizationCurrency currency;

    ProjectsController(ProjectService projects, PortfolioResponses responses, OrganizationCurrency currency) {
        this.projects = projects;
        this.responses = responses;
        this.currency = currency;
    }

    @GetMapping
    PageResponse<ProjectResponse> list(
            @RequestParam(name = "portfolioId", required = false) UUID portfolioId,
            @RequestParam(name = "programId", required = false) UUID programId,
            @RequestParam(name = "status", required = false) ProjectStatus status,
            @RequestParam(name = "methodology", required = false) Methodology methodology,
            @RequestParam(name = "health", required = false) Health health,
            @RequestParam(name = "q", required = false) @Size(max = 100) String q,
            Pageable pageable) {
        Page<Project> page = projects.list(
                new ProjectSearch(portfolioId, programId, status, methodology, health, q, null), pageable);
        return PageResponse.from(
                new PageImpl<>(responses.projects(page.getContent()), page.getPageable(), page.getTotalElements()));
    }

    @PostMapping
    ResponseEntity<ProjectResponse> create(@Valid @RequestBody CreateProjectRequest body) {
        Project project = projects.create(new NewProject(
                body.code(),
                body.name(),
                body.description(),
                body.portfolioId(),
                body.programId(),
                body.managerId(),
                body.methodology(),
                body.startDate(),
                body.targetEndDate(),
                money(body.budget())));
        return ResponseEntity.created(URI.create("/api/v1/projects/" + project.getId()))
                .eTag(EntityTags.of(project.getVersion()))
                .body(responses.project(project));
    }

    @GetMapping("/{projectId}")
    ResponseEntity<ProjectResponse> get(@PathVariable("projectId") UUID projectId) {
        return withETag(projects.get(projectId));
    }

    @PatchMapping("/{projectId}")
    ResponseEntity<ProjectResponse> update(
            @PathVariable("projectId") UUID projectId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateProjectRequest body) {
        ProjectChanges changes = new ProjectChanges(
                body.name(),
                body.description(),
                body.programId(),
                body.managerId(),
                body.methodology(),
                body.startDate(),
                body.targetEndDate(),
                money(body.budget()));
        return withETag(projects.update(projectId, expectedVersion, changes));
    }

    @PostMapping("/{projectId}/transitions")
    ResponseEntity<ProjectResponse> transition(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody TransitionRequest body) {
        return withETag(projects.transition(projectId, body.to(), body.reason()));
    }

    @PutMapping("/{projectId}/health-override")
    ResponseEntity<ProjectResponse> overrideHealth(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody HealthOverrideRequest body) {
        return withETag(projects.overrideHealth(projectId, body.health(), body.reason()));
    }

    @DeleteMapping("/{projectId}/health-override")
    ResponseEntity<ProjectResponse> clearHealthOverride(@PathVariable("projectId") UUID projectId) {
        return withETag(projects.clearHealthOverride(projectId));
    }

    @GetMapping("/{projectId}/members")
    List<ProjectMemberResponse> team(@PathVariable("projectId") UUID projectId) {
        return projects.team(projectId).stream().map(ProjectsController::member).toList();
    }

    @PutMapping("/{projectId}/members/{userId}")
    ProjectMemberResponse putMember(
            @PathVariable("projectId") UUID projectId,
            @PathVariable("userId") UUID userId,
            @Valid @RequestBody PutProjectMemberRequest body) {
        if (body.projectRole() == ProjectRole.MANAGER) {
            throw new InvalidInputException(FieldViolation.of(
                    "projectRole",
                    PlatformErrorCodes.Field.INVALID,
                    "The manager is set on the project (PATCH managerId), not as a team role"));
        }
        return member(projects.putTeamMember(projectId, userId, body.projectRole()));
    }

    @DeleteMapping("/{projectId}/members/{userId}")
    ResponseEntity<Void> removeMember(@PathVariable("projectId") UUID projectId, @PathVariable("userId") UUID userId) {
        projects.removeTeamMember(projectId, userId);
        return ResponseEntity.noContent().build();
    }

    private Money money(MoneyJson budget) {
        return budget == null ? null : budget.toMoney("budget", currency.current());
    }

    private ResponseEntity<ProjectResponse> withETag(Project project) {
        return ResponseEntity.ok().eTag(EntityTags.of(project.getVersion())).body(responses.project(project));
    }

    private static ProjectMemberResponse member(TeamMember member) {
        return new ProjectMemberResponse(
                member.userId(), member.fullName(), member.email(), member.role(), member.addedAt());
    }
}
