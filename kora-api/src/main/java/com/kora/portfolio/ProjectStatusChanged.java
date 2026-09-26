package com.kora.portfolio;

import java.util.UUID;

/** A lifecycle move (feature 04); notifications and the audit trail (Phase 8) react to it. */
public record ProjectStatusChanged(UUID projectId, String from, String to, String reason) {}
