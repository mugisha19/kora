package com.kora.portfolio.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.web.SortPolicy;
import com.kora.portfolio.PortfolioErrorCodes;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioRepository;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioSearch;
import com.kora.portfolio.application.PortfolioRepositories.ProgramRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import com.kora.portfolio.domain.Portfolio;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Portfolios (feature 04): everyone sees them; {@code PMO} and {@code ORG_ADMIN} govern them. */
@Service
public class PortfolioService {

    static final SortPolicy SORT =
            SortPolicy.defaultingTo(Sort.by("name")).allow("name").allow("createdAt");

    private final PortfolioRepository portfolios;
    private final ProgramRepository programs;
    private final ProjectRepository projects;
    private final People people;
    private final Clock clock;

    PortfolioService(
            PortfolioRepository portfolios,
            ProgramRepository programs,
            ProjectRepository projects,
            People people,
            Clock clock) {
        this.portfolios = portfolios;
        this.programs = programs;
        this.projects = projects;
        this.people = people;
        this.clock = clock;
    }

    /** A portfolio with how many programs and projects it holds. */
    public record PortfolioView(Portfolio portfolio, long programCount, long projectCount) {}

    public record PortfolioChanges(
            String name, String description, List<String> strategicObjectives, UUID ownerId, Portfolio.Status status) {}

    @Transactional(readOnly = true)
    public Page<PortfolioView> list(PortfolioSearch search, Pageable pageable) {
        CurrentMember.get();
        Page<Portfolio> page = portfolios.search(search, SORT.apply(pageable));
        List<UUID> ids = page.getContent().stream().map(Portfolio::getId).toList();
        Map<UUID, Long> programCounts = asMap(programs.countByPortfolio(ids));
        Map<UUID, Long> projectCounts = asMap(projects.countByPortfolio(ids));
        return page.map(portfolio -> new PortfolioView(
                portfolio,
                programCounts.getOrDefault(portfolio.getId(), 0L),
                projectCounts.getOrDefault(portfolio.getId(), 0L)));
    }

    @Transactional(readOnly = true)
    public PortfolioView get(UUID portfolioId) {
        CurrentMember.get();
        return view(find(portfolioId));
    }

    @Transactional
    public PortfolioView create(String name, String description, List<String> objectives, UUID ownerId) {
        ActiveMember caller = CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        UUID owner = ownerId == null ? caller.userId() : ownerId;
        people.requireRole(owner, "ownerId", People.GOVERNORS);
        Portfolio portfolio = portfolios.save(
                Portfolio.create(caller.organizationId(), name, description, objectives, owner, clock.instant()));
        return new PortfolioView(portfolio, 0, 0);
    }

    /**
     * Changes the given fields. An archived portfolio accepts only its reactivation (which may come with other
     * changes in the same request).
     */
    @Transactional
    public PortfolioView update(UUID portfolioId, long expectedVersion, PortfolioChanges changes) {
        CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        Portfolio portfolio = find(portfolioId);
        OptimisticLock.check(expectedVersion, portfolio.getVersion());
        if (changes.status() == Portfolio.Status.ACTIVE) {
            portfolio.reactivate();
        }
        boolean otherChanges = changes.name() != null
                || changes.description() != null
                || changes.strategicObjectives() != null
                || changes.ownerId() != null;
        if (otherChanges || changes.status() == Portfolio.Status.ARCHIVED) {
            portfolio.ensureActive();
        }
        if (changes.name() != null) {
            portfolio.rename(changes.name());
        }
        if (changes.description() != null) {
            portfolio.describe(changes.description());
        }
        if (changes.strategicObjectives() != null) {
            portfolio.setStrategicObjectives(changes.strategicObjectives());
        }
        if (changes.ownerId() != null) {
            people.requireRole(changes.ownerId(), "ownerId", People.GOVERNORS);
            portfolio.assignOwner(changes.ownerId());
        }
        if (changes.status() == Portfolio.Status.ARCHIVED) {
            portfolio.archive();
        }
        return view(portfolios.saveAndFlush(portfolio));
    }

    /** Only an empty portfolio can be deleted; one with history is archived instead. */
    @Transactional
    public void delete(UUID portfolioId) {
        CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        Portfolio portfolio = find(portfolioId);
        if (programs.existsByPortfolioId(portfolioId) || projects.existsByPortfolioId(portfolioId)) {
            throw new ConflictException(
                    PortfolioErrorCodes.PORTFOLIO_NOT_EMPTY,
                    "The portfolio still holds programs or projects; archive it instead");
        }
        portfolios.delete(portfolio);
    }

    Portfolio find(UUID portfolioId) {
        return portfolios.findById(portfolioId).orElseThrow(() -> NotFoundException.of("Portfolio", portfolioId));
    }

    /** For request bodies naming a portfolio: an unknown id is a bad field, not a missing resource. */
    Portfolio findForField(UUID portfolioId, String field) {
        return portfolios
                .findById(portfolioId)
                .orElseThrow(() -> new InvalidInputException(
                        FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, "no such portfolio")));
    }

    private PortfolioView view(Portfolio portfolio) {
        List<UUID> id = List.of(portfolio.getId());
        return new PortfolioView(
                portfolio,
                asMap(programs.countByPortfolio(id)).getOrDefault(portfolio.getId(), 0L),
                asMap(projects.countByPortfolio(id)).getOrDefault(portfolio.getId(), 0L));
    }

    private static Map<UUID, Long> asMap(List<OwnerCount> counts) {
        return counts.stream().collect(Collectors.toMap(OwnerCount::ownerId, OwnerCount::count));
    }
}
