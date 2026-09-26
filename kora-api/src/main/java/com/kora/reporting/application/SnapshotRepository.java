package com.kora.reporting.application;

import com.kora.portfolio.Health;
import com.kora.portfolio.ProjectVisibility;
import com.kora.reporting.domain.ProjectSnapshot;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for the dashboard read model (tenant-filtered). */
public interface SnapshotRepository {

    record SnapshotFilter(ProjectVisibility visibility, UUID portfolioId, Health health) {}

    Optional<ProjectSnapshot> findById(UUID projectId);

    Page<ProjectSnapshot> search(SnapshotFilter filter, Pageable pageable);

    List<ProjectSnapshot> search(SnapshotFilter filter);

    ProjectSnapshot save(ProjectSnapshot snapshot);

    void delete(ProjectSnapshot snapshot);
}
