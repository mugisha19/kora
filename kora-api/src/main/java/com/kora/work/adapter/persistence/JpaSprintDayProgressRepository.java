package com.kora.work.adapter.persistence;

import com.kora.work.application.SprintDayProgressRepository;
import com.kora.work.domain.SprintDayProgress;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaSprintDayProgressRepository extends Repository<SprintDayProgress, UUID>, SprintDayProgressRepository {

    /** Native for the upsert; it runs in the same transaction, so RLS still applies. */
    @Override
    @Modifying
    @Query(value = """
                    INSERT INTO sprint_day_progress (id, organization_id, sprint_id, day, remaining_points)
                    VALUES (:id, :organizationId, :sprintId, :day, :remainingPoints)
                    ON CONFLICT (sprint_id, day) DO UPDATE SET remaining_points = excluded.remaining_points
                    """, nativeQuery = true)
    void upsert(
            @Param("id") UUID id,
            @Param("organizationId") UUID organizationId,
            @Param("sprintId") UUID sprintId,
            @Param("day") LocalDate day,
            @Param("remainingPoints") int remainingPoints);
}
