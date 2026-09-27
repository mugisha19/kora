package com.kora.governance.adapter.persistence;

import com.kora.governance.application.GovernanceSequenceRepository;
import com.kora.governance.domain.GovernanceSequence;
import jakarta.persistence.LockModeType;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaGovernanceSequenceRepository
        extends Repository<GovernanceSequence, GovernanceSequence.Key>, GovernanceSequenceRepository {

    /** Native because JPA has no "insert unless present"; it runs in the same transaction, so RLS still applies. */
    @Override
    @Modifying
    @Query(value = """
                    INSERT INTO governance_sequences (project_id, kind, organization_id, last_number)
                    VALUES (:projectId, :kind, :organizationId, 0)
                    ON CONFLICT (project_id, kind) DO NOTHING
                    """, nativeQuery = true)
    void createIfAbsent(
            @Param("projectId") UUID projectId,
            @Param("kind") String kind,
            @Param("organizationId") UUID organizationId);

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from GovernanceSequence s where s.projectId = :projectId and s.kind = :kind")
    GovernanceSequence lock(@Param("projectId") UUID projectId, @Param("kind") String kind);
}
