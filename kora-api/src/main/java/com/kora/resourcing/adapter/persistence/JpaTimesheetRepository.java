package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.TimesheetRepository;
import com.kora.resourcing.domain.Timesheet;
import com.kora.resourcing.domain.TimesheetStatus;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

interface JpaTimesheetRepository extends Repository<Timesheet, UUID>, TimesheetRepository {

    @Override
    default Page<Timesheet> search(UUID projectId, TimesheetStatus status, LocalDate weekStart, Pageable pageable) {
        if (status == null && weekStart == null) {
            return findByProjectId(projectId, pageable);
        }
        if (weekStart == null) {
            return findByProjectIdAndStatus(projectId, status, pageable);
        }
        if (status == null) {
            return findByProjectIdAndWeekStart(projectId, weekStart, pageable);
        }
        return findByProjectIdAndStatusAndWeekStart(projectId, status, weekStart, pageable);
    }

    Page<Timesheet> findByProjectId(UUID projectId, Pageable pageable);

    Page<Timesheet> findByProjectIdAndStatus(UUID projectId, TimesheetStatus status, Pageable pageable);

    Page<Timesheet> findByProjectIdAndWeekStart(UUID projectId, LocalDate weekStart, Pageable pageable);

    Page<Timesheet> findByProjectIdAndStatusAndWeekStart(
            UUID projectId, TimesheetStatus status, LocalDate weekStart, Pageable pageable);
}
