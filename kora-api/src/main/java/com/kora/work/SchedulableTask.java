package com.kora.work;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A task as the schedule sees it.
 *
 * @param status the task status name
 * @param durationDays working days, or null when nobody planned it
 * @param notBefore the start-no-earlier-than date, or null for as soon as possible
 */
public record SchedulableTask(
        UUID id, String key, String title, String status, Integer durationDays, LocalDate notBefore) {}
