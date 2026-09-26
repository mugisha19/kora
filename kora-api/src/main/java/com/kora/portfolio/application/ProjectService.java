package com.kora.portfolio.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberSummary;
import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.Health;
import com.kora.portfolio.PortfolioErrorCodes;
import com.kora.portfolio.ProjectChanged;
import com.kora.portfolio.ProjectHealthChanged;
import com.kora.portfolio.ProjectStatusChanged;
import com.kora.portfolio.application.PortfolioRepositories.CharterRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectMemberRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectSearch;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.Methodology;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Program;
import com.kora.portfolio.domain.Project;
import com.kora.portfolio.domain.ProjectMember;
import com.kora.portfolio.domain.ProjectRole;
import com.kora.portfolio.domain.ProjectStatus;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Projects, their lifecycle, team and health override (feature 04). */
@Service
public class ProjectService {

    static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by("code"))
            .allow("code")
            .allow("name")
            .allow("status")
            .allow("startDate")
            .allow("targetEndDate");

    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final CharterRepository charters;
    private final ProjectAccessService access;
    private final PortfolioService portfolios;
    private final ProgramService programs;
    private final People people;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    ProjectService(
            ProjectRepository projects,
            ProjectMemberRepository members,
            CharterRepository charters,
            ProjectAccessService access,
            PortfolioService portfolios,
            ProgramService programs,
            People people,
            ApplicationEventPublisher events,
            Clock clock) {
        this.projects = projects;
        this.members = members;
        this.charters = charters;
        this.access = access;
        this.portfolios = portfolios;
        this.programs = programs;
        this.people = people;
        this.events = events;
        this.clock = clock;
    }

    public record NewProject(
            String code,
            String name,
            String description,
            UUID portfolioId,
            UUID programId,
            UUID managerId,
            Methodology methodology,
            LocalDate startDate,
            LocalDate targetEndDate,
            Money budget) {}

    public record ProjectChanges(
            String name,
            String description,
            UUID programId,
            UUID managerId,
            Methodology methodology,
            LocalDate startDate,
            LocalDate targetEndDate,
            Money budget) {}

    public record TeamMember(UUID userId, String fullName, String email, ProjectRole role, Instant addedAt) {}

    @Transactional(readOnly = true)
    public Page<Project> list(ProjectSearch filters, Pageable pageable) {
        ActiveMember caller = CurrentMember.get();
        UUID visibleTo = ProjectAccessService.seesEverything(caller) ? null : caller.userId();
        ProjectSearch search = new ProjectSearch(
                filters.portfolioId(),
                filters.programId(),
                filters.status(),
                filters.methodology(),
                filters.health(),
                filters.q(),
                visibleTo);
        return projects.search(search, SORT.apply(pageable));
    }

    @Transactional(readOnly = true)
    public Project get(UUID projectId) {
        return access.loadVisible(projectId);
    }

    /** A new project starts {@code PROPOSED} with an empty draft charter, managed by the caller unless told otherwise. */
    @Transactional
    public Project create(NewProject command) {
        ActiveMember caller = CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO, Role.PROJECT_MANAGER);
        Portfolio portfolio = portfolios.findForField(command.portfolioId(), "portfolioId");
        portfolio.ensureActive();
        requireProgramIn(command.programId(), portfolio.getId());
        UUID managerId = command.managerId() == null ? caller.userId() : command.managerId();
        people.requireRole(managerId, "managerId", People.MANAGERS);
        if (projects.existsByCode(command.code())) {
            throw new ConflictException(
                    PortfolioErrorCodes.PROJECT_CODE_TAKEN,
                    "Another project already uses this code",
                    List.of(FieldViolation.of("code", PortfolioErrorCodes.PROJECT_CODE_TAKEN, "is already used")));
        }
        Project project = projects.save(Project.propose(
                caller.organizationId(),
                portfolio.getId(),
                command.programId(),
                command.code(),
                command.name(),
                command.description(),
                managerId,
                command.methodology(),
                command.startDate(),
                command.targetEndDate(),
                command.budget(),
                clock.instant()));
        charters.save(Charter.firstDraft(caller.organizationId(), project.getId(), clock.instant()));
        events.publishEvent(new ProjectChanged(project.getId()));
        return project;
    }

    @Transactional
    public Project update(UUID projectId, long expectedVersion, ProjectChanges changes) {
        Project project = access.loadManageable(projectId);
        OptimisticLock.check(expectedVersion, project.getVersion());
        if (changes.name() != null) {
            project.rename(changes.name());
        }
        if (changes.description() != null) {
            project.describe(changes.description());
        }
        if (changes.programId() != null) {
            requireProgramIn(changes.programId(), project.getPortfolioId());
            project.moveToProgram(changes.programId());
        }
        if (changes.managerId() != null) {
            people.requireRole(changes.managerId(), "managerId", People.MANAGERS);
            project.assignManager(changes.managerId());
        }
        if (changes.methodology() != null) {
            project.changeMethodology(changes.methodology());
        }
        if (changes.startDate() != null || changes.targetEndDate() != null) {
            project.reschedule(
                    changes.startDate() == null ? project.getStartDate() : changes.startDate(),
                    changes.targetEndDate() == null ? project.getTargetEndDate() : changes.targetEndDate());
        }
        if (changes.budget() != null) {
            project.changeBudget(changes.budget());
        }
        Project saved = projects.saveAndFlush(project);
        events.publishEvent(new ProjectChanged(projectId));
        return saved;
    }

    @Transactional
    public Project transition(UUID projectId, ProjectStatus target, String reason) {
        Project project = access.loadManageable(projectId);
        ProjectStatus from = project.getStatus();
        project.transitionTo(target, reason);
        Project saved = projects.saveAndFlush(project);
        events.publishEvent(new ProjectStatusChanged(projectId, from.name(), target.name(), reason));
        events.publishEvent(new ProjectChanged(projectId));
        return saved;
    }

    @Transactional
    public Project overrideHealth(UUID projectId, Health health, String reason) {
        Project project = access.loadManageable(projectId);
        Health before = project.effectiveHealth();
        project.overrideHealth(health, reason);
        return healthChanged(project, before);
    }

    @Transactional
    public Project clearHealthOverride(UUID projectId) {
        Project project = access.loadManageable(projectId);
        Health before = project.effectiveHealth();
        project.clearHealthOverride();
        return healthChanged(project, before);
    }

    private Project healthChanged(Project project, Health before) {
        Project saved = projects.saveAndFlush(project);
        events.publishEvent(new ProjectChanged(project.getId()));
        if (before != saved.effectiveHealth()) {
            events.publishEvent(new ProjectHealthChanged(
                    project.getId(), before, saved.effectiveHealth(), saved.effectiveHealthReason()));
        }
        return saved;
    }

    // ---- Team -------------------------------------------------------------------------------------------------

    /** The manager first, then the team by name. */
    @Transactional(readOnly = true)
    public List<TeamMember> team(UUID projectId) {
        Project project = access.loadVisible(projectId);
        List<ProjectMember> stored = members.findByProjectId(projectId);
        List<UUID> ids =
                new ArrayList<>(stored.stream().map(ProjectMember::getUserId).toList());
        ids.add(project.getManagerId());
        Map<UUID, People.Person> directory = people.lookup(ids);
        List<TeamMember> team = new ArrayList<>();
        team.add(teamMember(directory, project.getManagerId(), ProjectRole.MANAGER, project.getCreatedAt()));
        stored.stream()
                .map(member -> teamMember(directory, member.getUserId(), member.getProjectRole(), member.getAddedAt()))
                .sorted(Comparator.comparing(TeamMember::fullName, String.CASE_INSENSITIVE_ORDER))
                .forEach(team::add);
        return team;
    }

    @Transactional
    public TeamMember putTeamMember(UUID projectId, UUID userId, ProjectRole role) {
        Project project = access.loadManageable(projectId);
        if (project.getManagerId().equals(userId)) {
            throw managerIsNotATeamRole();
        }
        MemberSummary person = people.requireMember(userId, "userId");
        ProjectMember member = members.findByProjectIdAndUserId(projectId, userId)
                .map(existing -> {
                    existing.changeRole(role);
                    return existing;
                })
                .orElseGet(() -> members.save(
                        ProjectMember.add(project.getOrganizationId(), projectId, userId, role, clock.instant())));
        return new TeamMember(userId, person.fullName(), person.email(), role, member.getAddedAt());
    }

    @Transactional
    public void removeTeamMember(UUID projectId, UUID userId) {
        Project project = access.loadManageable(projectId);
        if (project.getManagerId().equals(userId)) {
            throw managerIsNotATeamRole();
        }
        ProjectMember member = members.findByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> NotFoundException.of("Project member", userId));
        members.delete(member);
    }

    /** Adds someone who must see the project (the charter's sponsor) as an observer, if they can't already. */
    void ensureCanSee(Project project, UUID userId) {
        if (!project.getManagerId().equals(userId) && !members.existsByProjectIdAndUserId(project.getId(), userId)) {
            members.save(ProjectMember.add(
                    project.getOrganizationId(), project.getId(), userId, ProjectRole.OBSERVER, clock.instant()));
        }
    }

    private void requireProgramIn(UUID programId, UUID portfolioId) {
        if (programId == null) {
            return;
        }
        Program program = programs.find(programId);
        if (!program.getPortfolioId().equals(portfolioId) || !program.isActive()) {
            throw new InvalidInputException(FieldViolation.of(
                    "programId", PlatformErrorCodes.Field.INVALID, "must be an active program of the same portfolio"));
        }
    }

    private static ConflictException managerIsNotATeamRole() {
        return new ConflictException(
                PortfolioErrorCodes.MEMBER_IS_MANAGER,
                "The project manager is set on the project; assign another manager first");
    }

    private static TeamMember teamMember(
            Map<UUID, People.Person> directory, UUID userId, ProjectRole role, Instant addedAt) {
        People.Person person = directory.get(userId);
        return new TeamMember(userId, person.fullName(), person.email(), role, addedAt);
    }
}
