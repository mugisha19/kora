package com.kora.portfolio;

import java.time.LocalDate;
import java.util.UUID;

/** A project as other modules may refer to it after an access check. */
public record ProjectRef(
        UUID id,
        String code,
        String name,
        UUID managerId,
        String methodology,
        String status,
        LocalDate startDate,
        LocalDate targetEndDate) {}
