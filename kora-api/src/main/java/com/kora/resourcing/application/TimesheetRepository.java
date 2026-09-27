package com.kora.resourcing.application;

import com.kora.resourcing.domain.Timesheet;
import com.kora.resourcing.domain.TimesheetStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for timesheets (tenant-filtered); entries are saved with their timesheet. */
public interface TimesheetRepository {

    Optional<Timesheet> findById(UUID id);

    List<Timesheet> findByUserIdAndWeekStart(UUID userId, LocalDate weekStart);

    Page<Timesheet> search(UUID projectId, TimesheetStatus status, LocalDate weekStart, Pageable pageable);

    /** The project's timesheets of the weeks starting in the range, by week then person (the timesheet report). */
    List<Timesheet> findByProjectIdAndWeekStartBetweenOrderByWeekStartAscUserIdAsc(
            UUID projectId, LocalDate firstWeekStart, LocalDate lastWeekStart);

    Timesheet saveAndFlush(Timesheet timesheet);

    void delete(Timesheet timesheet);
}
