package com.kora.governance.application;

import com.kora.governance.domain.Stakeholder;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for stakeholders (tenant-filtered). */
public interface StakeholderRepository {

    Optional<Stakeholder> findById(UUID id);

    /** A project's register is small; quadrant and gap are derived, so filtering happens in memory. */
    List<Stakeholder> findByProjectIdAndRemovedFalseOrderByNameAsc(UUID projectId);

    Stakeholder save(Stakeholder stakeholder);

    Stakeholder saveAndFlush(Stakeholder stakeholder);
}
