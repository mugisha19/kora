package com.kora.resourcing.application;

import com.kora.resourcing.domain.TimeEntry;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** Read port for time entries across timesheets. */
public interface TimeEntryRepository {

    /** Entries of the project's approved timesheets: the hours that make its actual cost. */
    List<TimeEntry> findApproved(UUID projectId);

    List<TimeEntry> findByUserIdInAndDateBetween(Collection<UUID> userIds, LocalDate from, LocalDate to);

    List<TimeEntry> findByProjectIdAndDateBetween(UUID projectId, LocalDate from, LocalDate to);
}
