package com.kora.portfolio.application;

import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectHealthChanged;
import com.kora.portfolio.ProjectQueries;
import com.kora.portfolio.ProjectSnapshotSource;
import com.kora.portfolio.application.PortfolioRepositories.CharterRepository;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.domain.CharterStatus;
import com.kora.portfolio.domain.Portfolio;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Feeds the reporting module's read model and stores the health it computes. */
@Service
class ProjectQueriesService implements ProjectQueries {

    private final ProjectRepository projects;
    private final CharterRepository charters;
    private final PortfolioRepository portfolios;
    private final ApplicationEventPublisher events;

    ProjectQueriesService(
            ProjectRepository projects,
            CharterRepository charters,
            PortfolioRepository portfolios,
            ApplicationEventPublisher events) {
        this.projects = projects;
        this.charters = charters;
        this.portfolios = portfolios;
        this.events = events;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> portfolioName(UUID portfolioId) {
        return portfolios.findById(portfolioId).map(Portfolio::getName);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ProjectSnapshotSource> snapshotSource(UUID projectId) {
        return projects.findById(projectId)
                .map(project -> new ProjectSnapshotSource(
                        project.getId(),
                        project.getPortfolioId(),
                        project.getProgramId(),
                        project.getCode(),
                        project.getName(),
                        project.getManagerId(),
                        project.getMethodology().name(),
                        project.getStatus().name(),
                        project.getStartDate(),
                        project.getTargetEndDate(),
                        project.getBudget(),
                        project.getHealthOverride(),
                        project.getHealthOverrideReason(),
                        milestones(projectId)));
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProjectKey> allProjects() {
        return projects.findAll().stream()
                .map(project -> new ProjectKey(project.getOrganizationId(), project.getId()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> projectIdsOfPortfolio(UUID portfolioId) {
        return projects.findIdsByPortfolioId(portfolioId);
    }

    @Override
    @Transactional
    public void recordComputedHealth(UUID projectId, Health health, String reason) {
        projects.findById(projectId).ifPresent(project -> {
            Health before = project.effectiveHealth();
            if (project.recordComputedHealth(health, reason)) {
                events.publishEvent(new ProjectHealthChanged(projectId, before, health, reason));
            }
        });
    }

    private List<ProjectSnapshotSource.Milestone> milestones(UUID projectId) {
        return charters.findFirstByProjectIdAndStatusNot(projectId, CharterStatus.SUPERSEDED)
                .map(charter -> charter.getMilestones().stream()
                        .map(milestone -> new ProjectSnapshotSource.Milestone(milestone.name(), milestone.targetDate()))
                        .toList())
                .orElse(List.of());
    }
}
