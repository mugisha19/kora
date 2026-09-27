package com.kora.reports;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.time.LocalDate;
import java.util.UUID;

/** What a report covers; each type uses some of these (contract schema {@code ReportParams}). */
public record ReportParams(UUID projectId, UUID portfolioId, LocalDate from, LocalDate to) {

    public static ReportParams none() {
        return new ReportParams(null, null, null, null);
    }

    /** The project, for the types that are about one; {@code 400} naming the request field otherwise. */
    public UUID requireProject() {
        if (projectId == null) {
            throw new InvalidInputException(
                    FieldViolation.of("params.projectId", PlatformErrorCodes.Field.REQUIRED, "this report needs one"));
        }
        return projectId;
    }
}
