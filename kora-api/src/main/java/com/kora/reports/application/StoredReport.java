package com.kora.reports.application;

/** Where an exported file went. */
public record StoredReport(String fileName, String storageKey, String contentType, long sizeBytes) {}
