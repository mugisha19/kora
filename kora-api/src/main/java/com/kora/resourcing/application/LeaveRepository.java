package com.kora.resourcing.application;

import com.kora.resourcing.domain.Leave;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for leave (tenant-filtered). */
public interface LeaveRepository {

    Optional<Leave> findById(UUID id);

    List<Leave> findByUserIdOrderByFromAsc(UUID userId);

    /** Leave overlapping the period. */
    List<Leave> findByUserIdInAndToGreaterThanEqualAndFromLessThanEqual(
            Collection<UUID> userIds, LocalDate from, LocalDate to);

    Leave save(Leave leave);

    void delete(Leave leave);
}
