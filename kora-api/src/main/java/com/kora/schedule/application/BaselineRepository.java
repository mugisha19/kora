package com.kora.schedule.application;

import com.kora.schedule.domain.Baseline;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for baselines (tenant-filtered). */
public interface BaselineRepository {

    Optional<Baseline> findFirstByProjectIdOrderByNumberDesc(UUID projectId);

    Baseline save(Baseline baseline);
}
