package com.kora.governance;

import java.util.UUID;

/**
 * A change request passed its last approval and was applied to the project's baselines, in the same transaction.
 * Kept for the audit trail and notifications (Phase 8).
 */
public record ChangeRequestApproved(UUID projectId, UUID changeRequestId, String key) {}
