package com.kora.resourcing.application;

import com.kora.resourcing.domain.CostRate;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for cost rates (tenant-filtered). */
public interface CostRateRepository {

    List<CostRate> findByUserIdOrderByValidFromDesc(UUID userId);

    List<CostRate> findByUserIdIn(Collection<UUID> userIds);

    Optional<CostRate> findByUserIdAndValidFrom(UUID userId, LocalDate validFrom);

    CostRate saveAndFlush(CostRate rate);
}
