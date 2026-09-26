package com.kora.reporting.adapter.persistence;

import com.kora.reporting.application.SnapshotRepository;
import com.kora.reporting.domain.ProjectSnapshot;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;

interface JpaSnapshotRepository
        extends Repository<ProjectSnapshot, UUID>, JpaSpecificationExecutor<ProjectSnapshot>, SnapshotRepository {

    @Override
    default Page<ProjectSnapshot> search(SnapshotFilter filter, Pageable pageable) {
        return findAll(matching(filter), pageable);
    }

    @Override
    default List<ProjectSnapshot> search(SnapshotFilter filter) {
        return findAll(matching(filter));
    }

    /** The caller's visible projects (every one, or an explicit set), optionally one portfolio and one health. */
    private static Specification<ProjectSnapshot> matching(SnapshotFilter filter) {
        Specification<ProjectSnapshot> all = Specification.unrestricted();
        if (!filter.visibility().all()) {
            all = all.and((row, query, cb) -> filter.visibility().projectIds().isEmpty()
                    ? cb.disjunction()
                    : row.get("projectId").in(filter.visibility().projectIds()));
        }
        if (filter.portfolioId() != null) {
            all = all.and((row, query, cb) -> cb.equal(row.get("portfolioId"), filter.portfolioId()));
        }
        if (filter.health() != null) {
            all = all.and((row, query, cb) -> cb.equal(row.get("health"), filter.health()));
        }
        return all;
    }
}
