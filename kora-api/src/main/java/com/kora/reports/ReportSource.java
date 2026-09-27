package com.kora.reports;

/**
 * The data side of one report type, implemented by the module that owns the data (the reports module knows no
 * project, risk or timesheet). Both methods run as the member who asked, through the module's own access checks, so
 * a report shows exactly what that member sees on screen.
 */
public interface ReportSource {

    ReportType type();

    /**
     * Validates the parameters and checks access, on the request thread, so {@code 400}, {@code 403} and {@code 404}
     * come back at once rather than as a failed job.
     */
    void check(ReportParams params);

    /** The content, in the requester's language ({@code labels}); runs in one read-only transaction. */
    ReportContent build(ReportParams params, ReportLabels labels);
}
