package com.kora.resourcing.application;

import com.kora.resourcing.domain.CapacityPeriod;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for capacity periods (tenant-filtered). */
public interface CapacityRepository {

    List<CapacityPeriod> findByUserIdOrderByValidFromDesc(UUID userId);

    List<CapacityPeriod> findByUserIdIn(Collection<UUID> userIds);

    Optional<CapacityPeriod> findByUserIdAndValidFrom(UUID userId, LocalDate validFrom);

    CapacityPeriod save(CapacityPeriod period);
}
