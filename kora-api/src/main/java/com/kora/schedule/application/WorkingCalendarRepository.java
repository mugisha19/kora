package com.kora.schedule.application;

import com.kora.schedule.domain.WorkingCalendar;
import java.util.Optional;

/** Persistence port for the working calendar: at most one row, the active organization's. */
public interface WorkingCalendarRepository {

    Optional<WorkingCalendar> findFirstBy();

    WorkingCalendar saveAndFlush(WorkingCalendar calendar);
}
