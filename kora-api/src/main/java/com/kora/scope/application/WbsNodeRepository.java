package com.kora.scope.application;

import com.kora.scope.domain.WbsNode;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for WBS nodes (tenant-filtered). */
public interface WbsNodeRepository {

    Optional<WbsNode> findById(UUID id);

    List<WbsNode> findByProjectId(UUID projectId);

    boolean existsByPlannedCostAmountGreaterThan(BigDecimal amount);

    WbsNode save(WbsNode node);

    WbsNode saveAndFlush(WbsNode node);

    void deleteAll(Iterable<? extends WbsNode> nodes);
}
