package com.kora.governance.application;

import com.kora.governance.domain.GovernanceSequence;
import java.util.UUID;

/** Persistence port for key numbers. */
public interface GovernanceSequenceRepository {

    /** Creates the counter at 0 unless it exists; safe when two requests do it at once. */
    void createIfAbsent(UUID projectId, String kind, UUID organizationId);

    /** The counter, locked until the transaction ends. */
    GovernanceSequence lock(UUID projectId, String kind);
}
