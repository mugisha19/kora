package com.kora.platform.demo;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Demo data (feature 22): history the public API can't create, because it only ever records "now", filled in by the
 * module that owns it: a closed sprint's burndown, the weekly earned value behind the S-curve. Implementations exist
 * only in the {@code demo} profile.
 */
public interface DemoHistory {

    /** Runs as an administrator of the organization, in its tenant scope, after the story was told through the API. */
    void backfill(UUID organizationId, LocalDate today);
}
