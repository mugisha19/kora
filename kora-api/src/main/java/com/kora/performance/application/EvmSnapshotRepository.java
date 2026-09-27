package com.kora.performance.application;

import com.kora.performance.domain.EvmSnapshot;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for EVM snapshots (tenant-filtered). */
public interface EvmSnapshotRepository {

    Optional<EvmSnapshot> findByProjectIdAndWeekStart(UUID projectId, LocalDate weekStart);

    List<EvmSnapshot> findByProjectIdAndWeekStartBetweenOrderByWeekStartAsc(
            UUID projectId, LocalDate from, LocalDate to);

    List<EvmSnapshot> findByProjectIdInAndWeekStartLessThanEqualOrderByWeekStartAsc(
            Collection<UUID> projectIds, LocalDate to);

    EvmSnapshot save(EvmSnapshot snapshot);
}
