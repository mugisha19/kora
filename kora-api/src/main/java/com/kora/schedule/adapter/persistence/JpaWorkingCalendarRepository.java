package com.kora.schedule.adapter.persistence;

import com.kora.schedule.application.WorkingCalendarRepository;
import com.kora.schedule.domain.WorkingCalendar;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaWorkingCalendarRepository extends Repository<WorkingCalendar, UUID>, WorkingCalendarRepository {}
