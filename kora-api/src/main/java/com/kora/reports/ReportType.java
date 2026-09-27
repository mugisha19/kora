package com.kora.reports;

import java.util.Locale;

/** The reports Kora exports; each has exactly one {@link ReportSource}. */
public enum ReportType {
    PROJECT_STATUS,
    PORTFOLIO_SUMMARY,
    RISK_REGISTER,
    EVM,
    TIMESHEETS;

    /** For file names: {@code project-status}. */
    public String slug() {
        return name().toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
