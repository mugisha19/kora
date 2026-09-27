package com.kora.audit.adapter.persistence;

import com.kora.audit.application.AuditEntryRepository;
import com.kora.audit.application.AuditSearch;
import com.kora.audit.domain.AuditEntry;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;

interface JpaAuditEntryRepository
        extends Repository<AuditEntry, UUID>, JpaSpecificationExecutor<AuditEntry>, AuditEntryRepository {

    /** The first rows only: no page count, which on the audit table would be the most expensive query. */
    @Override
    default List<AuditEntry> search(AuditSearch search, int limit) {
        return findBy(
                specification(search),
                query -> query.sortBy(Sort.by(Sort.Order.desc("chainPosition")))
                        .limit(limit)
                        .all());
    }

    @Override
    default List<AuditEntry> chain(Instant from, Instant to) {
        return findAll(
                specification(new AuditSearch(null, null, null, null, null, null, from, to, null)),
                Sort.by("chainPosition"));
    }

    private static Specification<AuditEntry> specification(AuditSearch search) {
        Specification<AuditEntry> all = Specification.unrestricted();
        if (search.actorId() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("actorId"), search.actorId()));
        }
        if (search.entityType() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("entityType"), search.entityType()));
        }
        if (search.entityId() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("entityId"), search.entityId()));
        }
        if (search.action() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("action"), search.action()));
        }
        if (search.projectId() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("projectId"), search.projectId()));
        }
        if (search.outcome() != null) {
            all = all.and((entry, query, cb) -> cb.equal(entry.get("outcome"), search.outcome()));
        }
        if (search.from() != null) {
            all = all.and((entry, query, cb) -> cb.greaterThanOrEqualTo(entry.get("occurredAt"), search.from()));
        }
        if (search.to() != null) {
            all = all.and((entry, query, cb) -> cb.lessThan(entry.get("occurredAt"), search.to()));
        }
        if (search.beforePosition() != null) {
            all = all.and((entry, query, cb) -> cb.lessThan(entry.get("chainPosition"), search.beforePosition()));
        }
        return all;
    }
}
