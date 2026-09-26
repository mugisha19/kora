package com.kora.portfolio.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.NotFoundException;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import com.kora.portfolio.ProjectVisibility;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectMemberRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.domain.Project;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may see and change a project (feature 04): {@code PMO} and {@code ORG_ADMIN} see and change every project; a
 * project's manager changes it; its team members see it; nobody else knows it exists (404).
 */
@Service
public class ProjectAccessService implements ProjectAccess {

    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final PortfolioRepository portfolios;

    ProjectAccessService(ProjectRepository projects, ProjectMemberRepository members, PortfolioRepository portfolios) {
        this.projects = projects;
        this.members = members;
        this.portfolios = portfolios;
    }

    public static boolean seesEverything(ActiveMember member) {
        return member.role() == Role.ORG_ADMIN || member.role() == Role.PMO;
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectRef readable(UUID projectId) {
        return ref(loadVisible(projectId));
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectRef manageable(UUID projectId) {
        return ref(loadManageable(projectId));
    }

    @Override
    @Transactional(readOnly = true)
    public ProjectVisibility visibility() {
        ActiveMember member = CurrentMember.get();
        if (seesEverything(member)) {
            return ProjectVisibility.everything();
        }
        Set<UUID> ids = new HashSet<>(projects.findIdsByManagerId(member.userId()));
        ids.addAll(members.findProjectIdsByUserId(member.userId()));
        return new ProjectVisibility(false, ids);
    }

    /** @throws NotFoundException unless the caller may see the project */
    Project loadVisible(UUID projectId) {
        ActiveMember member = CurrentMember.get();
        Project project = projects.findById(projectId).orElseThrow(() -> NotFoundException.of("Project", projectId));
        boolean visible = seesEverything(member)
                || project.getManagerId().equals(member.userId())
                || members.existsByProjectIdAndUserId(projectId, member.userId());
        if (!visible) {
            throw NotFoundException.of("Project", projectId);
        }
        return project;
    }

    /**
     * @throws ForbiddenException for a visible project the caller may not change
     * @throws com.kora.platform.error.ConflictException {@code portfolios.archived} when its portfolio is archived
     */
    Project loadManageable(UUID projectId) {
        Project project = loadVisible(projectId);
        ActiveMember member = CurrentMember.get();
        if (!seesEverything(member) && !project.getManagerId().equals(member.userId())) {
            throw new ForbiddenException("Only the project manager, PMO or an administrator can change this project");
        }
        ensurePortfolioActive(project.getPortfolioId());
        return project;
    }

    void ensurePortfolioActive(UUID portfolioId) {
        portfolios.findById(portfolioId).ifPresent(portfolio -> portfolio.ensureActive());
    }

    private static ProjectRef ref(Project project) {
        return new ProjectRef(
                project.getId(),
                project.getCode(),
                project.getName(),
                project.getManagerId(),
                project.getMethodology().name(),
                project.getStatus().name());
    }
}
