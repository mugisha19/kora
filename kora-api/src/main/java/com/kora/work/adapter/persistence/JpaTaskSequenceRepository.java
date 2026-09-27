package com.kora.work.adapter.persistence;

import com.kora.work.application.TaskSequenceRepository;
import com.kora.work.domain.TaskSequence;
import jakarta.persistence.LockModeType;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaTaskSequenceRepository extends Repository<TaskSequence, UUID>, TaskSequenceRepository {

    /** Native because JPA has no "insert unless present"; it runs in the same transaction, so RLS still applies. */
    @Override
    @Modifying
    @Query(value = """
                    INSERT INTO task_sequences (project_id, organization_id, last_number)
                    VALUES (:projectId, :organizationId, 0)
                    ON CONFLICT (project_id) DO NOTHING
                    """, nativeQuery = true)
    void createIfAbsent(@Param("projectId") UUID projectId, @Param("organizationId") UUID organizationId);

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from TaskSequence s where s.projectId = :projectId")
    TaskSequence lockByProjectId(@Param("projectId") UUID projectId);
}
