package com.kora.governance.application;

import com.kora.governance.domain.Risk;
import com.kora.governance.domain.RiskStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for risks (tenant-filtered). */
public interface RiskRepository {

    Optional<Risk> findById(UUID id);

    Page<Risk> search(RiskSearch search, Pageable pageable);

    List<Risk> search(RiskSearch search);

    List<Risk> findByProjectIdAndStatusNot(UUID projectId, RiskStatus status);

    Risk save(Risk risk);

    Risk saveAndFlush(Risk risk);
}
