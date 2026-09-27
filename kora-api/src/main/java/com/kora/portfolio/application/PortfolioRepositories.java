package com.kora.portfolio.application;

import com.kora.portfolio.Health;
import com.kora.portfolio.domain.Charter;
import com.kora.portfolio.domain.CharterStatus;
import com.kora.portfolio.domain.Methodology;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Program;
import com.kora.portfolio.domain.Project;
import com.kora.portfolio.domain.ProjectMember;
import com.kora.portfolio.domain.ProjectStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Persistence ports of the portfolio module, implemented by Spring Data repositories in {@code adapter.persistence}.
 * All queries are tenant-filtered ({@code @TenantId} and row-level security).
 */
public final class PortfolioRepositories {

    private PortfolioRepositories() {}

    public record PortfolioSearch(Portfolio.Status status, String q) {}

    /**
     * Project list filters. {@code visibleTo} is null for callers who see every project; otherwise only projects
     * that user manages or is a member of match.
     */
    public record ProjectSearch(
            UUID portfolioId,
            UUID programId,
            ProjectStatus status,
            Methodology methodology,
            Health health,
            String q,
            UUID visibleTo) {}

    public interface PortfolioRepository {

        Optional<Portfolio> findById(UUID id);

        Page<Portfolio> search(PortfolioSearch search, Pageable pageable);

        Portfolio save(Portfolio portfolio);

        Portfolio saveAndFlush(Portfolio portfolio);

        void delete(Portfolio portfolio);
    }

    public interface ProgramRepository {

        Optional<Program> findById(UUID id);

        List<Program> findByPortfolioIdOrderByName(UUID portfolioId);

        boolean existsByPortfolioId(UUID portfolioId);

        List<OwnerCount> countByPortfolio(Collection<UUID> portfolioIds);

        Program save(Program program);

        Program saveAndFlush(Program program);
    }

    public interface ProjectRepository {

        Optional<Project> findById(UUID id);

        boolean existsByCode(String code);

        boolean existsByPortfolioId(UUID portfolioId);

        boolean existsByBudgetAmountIsNotNull();

        Page<Project> search(ProjectSearch search, Pageable pageable);

        List<OwnerCount> countByPortfolio(Collection<UUID> portfolioIds);

        List<OwnerCount> countByProgram(Collection<UUID> programIds);

        /** Project ids the user manages (for visibility). */
        Set<UUID> findIdsByManagerId(UUID managerId);

        Set<UUID> findIdsByPortfolioId(UUID portfolioId);

        /** Every project in scope; with the system scope, every project of every organization. */
        List<Project> findAll();

        Project save(Project project);

        Project saveAndFlush(Project project);
    }

    public interface ProjectMemberRepository {

        Optional<ProjectMember> findByProjectIdAndUserId(UUID projectId, UUID userId);

        List<ProjectMember> findByProjectId(UUID projectId);

        boolean existsByProjectIdAndUserId(UUID projectId, UUID userId);

        /** Project ids the user is a team member of (for visibility). */
        Set<UUID> findProjectIdsByUserId(UUID userId);

        ProjectMember save(ProjectMember member);

        void delete(ProjectMember member);
    }

    public interface CharterRepository {

        /** The current charter: the one version that isn't superseded. */
        Optional<Charter> findFirstByProjectIdAndStatusNot(UUID projectId, CharterStatus status);

        List<Charter> findByProjectIdOrderByVersionNumberDesc(UUID projectId);

        boolean existsBySummaryBudgetAmountIsNotNull();

        Charter save(Charter charter);

        Charter saveAndFlush(Charter charter);
    }
}
