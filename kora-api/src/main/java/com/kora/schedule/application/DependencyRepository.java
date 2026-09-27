package com.kora.schedule.application;

import com.kora.schedule.domain.Dependency;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for task dependencies (tenant-filtered). */
public interface DependencyRepository {

    Optional<Dependency> findById(UUID id);

    List<Dependency> findByProjectIdOrderByCreatedAtAsc(UUID projectId);

    boolean existsByPredecessorIdAndSuccessorId(UUID predecessorId, UUID successorId);

    Dependency save(Dependency dependency);

    void delete(Dependency dependency);
}
