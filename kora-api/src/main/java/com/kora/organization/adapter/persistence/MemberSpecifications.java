package com.kora.organization.adapter.persistence;

import com.kora.organization.application.MemberSearch;
import com.kora.organization.domain.Membership;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/**
 * Member filters as composable Specifications (Specification pattern): each filter is a small predicate, combined
 * only when present. The tenant condition is not here on purpose: {@code @TenantId} adds it to every query.
 */
final class MemberSpecifications {

    private MemberSpecifications() {}

    static Specification<Membership> matching(MemberSearch search) {
        Specification<Membership> all = Specification.unrestricted();
        if (search.q() != null && !search.q().isBlank()) {
            all = all.and(nameOrEmailContains(search.q()));
        }
        if (search.role() != null) {
            all = all.and((member, query, cb) -> cb.equal(member.get("role"), search.role()));
        }
        return all;
    }

    /** Case-insensitive "contains"; the user's {@code %} and {@code _} are matched literally, not as wildcards. */
    private static Specification<Membership> nameOrEmailContains(String text) {
        String pattern = "%" + escapeLike(text.strip().toLowerCase(Locale.ROOT)) + "%";
        return (member, query, cb) -> cb.or(
                cb.like(cb.lower(member.get("memberName")), pattern, '\\'),
                cb.like(cb.lower(member.get("memberEmail")), pattern, '\\'));
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
