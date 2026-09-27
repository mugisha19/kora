package com.kora.governance.adapter.persistence;

import com.kora.governance.application.IssueSearch;
import com.kora.governance.application.RiskSearch;
import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssueStatus;
import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskStatus;
import java.util.List;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/**
 * Risk and issue filters as composable Specifications. The tenant condition is absent on purpose: {@code @TenantId}
 * adds it to every query.
 */
final class GovernanceSpecifications {

    private GovernanceSpecifications() {}

    static Specification<Risk> risks(RiskSearch search) {
        Specification<Risk> all = Specification.unrestricted();
        if (search.projectIds() != null) {
            all = all.and(
                    search.projectIds().isEmpty()
                            ? (risk, query, cb) -> cb.disjunction()
                            : (risk, query, cb) -> risk.get("projectId").in(search.projectIds()));
        }
        if (search.openOnly()) {
            all = all.and((risk, query, cb) -> cb.notEqual(risk.get("status"), RiskStatus.CLOSED));
        }
        if (search.status() != null) {
            all = all.and((risk, query, cb) -> cb.equal(risk.get("status"), search.status()));
        }
        if (search.kind() != null) {
            all = all.and((risk, query, cb) -> cb.equal(risk.get("kind"), search.kind()));
        }
        if (search.category() != null) {
            all = all.and((risk, query, cb) -> cb.equal(risk.get("category"), search.category()));
        }
        if (search.ownerId() != null) {
            all = all.and((risk, query, cb) -> cb.equal(risk.get("ownerId"), search.ownerId()));
        }
        if (search.minScore() != null) {
            all = all.and((risk, query, cb) -> cb.ge(risk.get("score"), search.minScore()));
        }
        if (hasText(search.q())) {
            String pattern = contains(search.q());
            all = all.and((risk, query, cb) -> cb.or(
                    cb.like(cb.lower(risk.get("title")), pattern, '\\'),
                    cb.like(cb.lower(risk.get("key")), pattern, '\\')));
        }
        return all;
    }

    static Specification<Issue> issues(IssueSearch search) {
        Specification<Issue> all = (issue, query, cb) -> cb.equal(issue.get("projectId"), search.projectId());
        if (search.status() != null) {
            all = all.and((issue, query, cb) -> cb.equal(issue.get("status"), search.status()));
        }
        if (search.priority() != null) {
            all = all.and((issue, query, cb) -> cb.equal(issue.get("priority"), search.priority()));
        }
        if (search.ownerId() != null) {
            all = all.and((issue, query, cb) -> cb.equal(issue.get("ownerId"), search.ownerId()));
        }
        if (search.overdueAsOf() != null) {
            all = all.and((issue, query, cb) -> cb.and(
                    issue.get("status").in(List.of(IssueStatus.OPEN, IssueStatus.IN_PROGRESS)),
                    cb.lessThan(issue.get("dueDate"), search.overdueAsOf())));
        }
        if (hasText(search.q())) {
            String pattern = contains(search.q());
            all = all.and((issue, query, cb) -> cb.or(
                    cb.like(cb.lower(issue.get("title")), pattern, '\\'),
                    cb.like(cb.lower(issue.get("key")), pattern, '\\')));
        }
        return all;
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
