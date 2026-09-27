package com.kora.reports.domain;

/** A job's life: waiting, being generated, then a file to download or a failure. */
public enum ReportStatus {
    QUEUED,
    RUNNING,
    READY,
    FAILED
}
