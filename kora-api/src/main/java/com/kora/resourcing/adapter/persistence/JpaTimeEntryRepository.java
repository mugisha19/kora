package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.TimeEntryRepository;
import com.kora.resourcing.domain.TimeEntry;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaTimeEntryRepository extends Repository<TimeEntry, UUID>, TimeEntryRepository {

    @Override
    @Query("""
            select e from TimeEntry e where e.timesheetId in (
              select t.id from Timesheet t
              where t.projectId = :projectId and t.status = com.kora.resourcing.domain.TimesheetStatus.APPROVED)
            """)
    List<TimeEntry> findApproved(@Param("projectId") UUID projectId);
}
