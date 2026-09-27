package com.kora.work.application;

import com.kora.work.domain.Sprint;
import com.kora.work.domain.SprintStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;

/** Persistence port for sprints (tenant-filtered). */
public interface SprintRepository {

    Optional<Sprint> findById(UUID id);

    List<Sprint> findByProjectIdOrderByStartDateDescCreatedAtDesc(UUID projectId);

    Optional<Sprint> findFirstByProjectIdAndStatus(UUID projectId, SprintStatus status);

    List<Sprint> findByStatus(SprintStatus status);

    List<Sprint> findByProjectIdAndStatusOrderByEndDateDesc(UUID projectId, SprintStatus status, Pageable page);

    Sprint save(Sprint sprint);

    Sprint saveAndFlush(Sprint sprint);
}
