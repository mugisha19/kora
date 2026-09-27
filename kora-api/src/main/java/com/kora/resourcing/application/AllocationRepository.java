package com.kora.resourcing.application;

import com.kora.resourcing.domain.Allocation;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for allocations (tenant-filtered). */
public interface AllocationRepository {

    List<Allocation> findByProjectIdOrderByWeekStartAscUserIdAsc(UUID projectId);

    List<Allocation> findByProjectIdAndWeekStartBetweenOrderByWeekStartAscUserIdAsc(
            UUID projectId, LocalDate from, LocalDate to);

    Optional<Allocation> findByProjectIdAndUserIdAndWeekStart(UUID projectId, UUID userId, LocalDate weekStart);

    List<Allocation> findByUserIdInAndWeekStartBetween(Collection<UUID> userIds, LocalDate from, LocalDate to);

    Allocation save(Allocation allocation);

    void delete(Allocation allocation);
}
