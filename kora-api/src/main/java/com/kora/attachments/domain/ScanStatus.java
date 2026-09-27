package com.kora.attachments.domain;

/** Malware scanning is a later add-on (ADR 0013); until one is configured every file is {@code NOT_SCANNED}. */
public enum ScanStatus {
    NOT_SCANNED,
    CLEAN,
    INFECTED
}
