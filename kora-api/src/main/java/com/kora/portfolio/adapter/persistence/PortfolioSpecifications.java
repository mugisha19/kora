package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.PortfolioRepositories.PortfolioSearch;
import com.kora.portfolio.application.PortfolioRepositories.ProjectSearch;
import com.kora.portfolio.domain.Portfolio;
import com.kora.portfolio.domain.Project;
import com.kora.portfolio.domain.ProjectMember;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;

/**
 * List filters as composable Specifications. The tenant condition is absent on purpose: {@code @TenantId} adds it to
 * every query.
 */
final class PortfolioSpecifications {

    private PortfolioSpecifications() {}

    static Specification<Portfolio> portfolios(PortfolioSearch search) {
        Specification<Portfolio> all = Specification.unrestricted();
        if (search.status() != null) {
            all = all.and((portfolio, query, cb) -> cb.equal(portfolio.get("status"), search.status()));
        }
        if (hasText(search.q())) {
            String pattern = contains(search.q());
            all = all.and((portfolio, query, cb) -> cb.like(cb.lower(portfolio.get("name")), pattern, '\\'));
        }
        return all;
    }

    static Specification<Project> projects(ProjectSearch search) {
        Specification<Project> all = Specification.unrestricted();
        if (search.visibleTo() != null) {
            all = all.and(visibleTo(search));
        }
        if (search.portfolioId() != null) {
            all = all.and((project, query, cb) -> cb.equal(project.get("portfolioId"), search.portfolioId()));
        }
        if (search.programId() != null) {
            all = all.and((project, query, cb) -> cb.equal(project.get("programId"), search.programId()));
        }
        if (search.status() != null) {
            all = all.and((project, query, cb) -> cb.equal(project.get("status"), search.status()));
        }
        if (search.methodology() != null) {
            all = all.and((project, query, cb) -> cb.equal(project.get("methodology"), search.methodology()));
        }
        if (search.health() != null) {
            // The effective health: the override when there is one, the computed value otherwise.
            all = all.and((project, query, cb) -> cb.equal(
                    cb.coalesce(project.get("healthOverride"), project.get("computedHealth")), search.health()));
        }
        if (hasText(search.q())) {
            String pattern = contains(search.q());
            all = all.and((project, query, cb) -> cb.or(
                    cb.like(cb.lower(project.get("name")), pattern, '\\'),
                    cb.like(cb.lower(project.get("code")), pattern, '\\')));
        }
        return all;
    }

    /** Projects the user manages, or is on the team of. */
    private static Specification<Project> visibleTo(ProjectSearch search) {
        return (project, query, cb) -> {
            Subquery<UUID> team = query.subquery(UUID.class);
            Root<ProjectMember> member = team.from(ProjectMember.class);
            team.select(member.get("projectId")).where(cb.equal(member.get("userId"), search.visibleTo()));
            return cb.or(
                    cb.equal(project.get("managerId"), search.visibleTo()),
                    project.get("id").in(team));
        };
    }

    private static boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    /** Case-insensitive "contains"; the user's {@code %} and {@code _} are matched literally. */
    private static String contains(String text) {
        String escaped = text.strip()
                .toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
