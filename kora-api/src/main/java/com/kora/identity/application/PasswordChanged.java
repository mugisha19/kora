package com.kora.identity.application;

import java.util.UUID;

/** A user's password changed; every session they had must end (and, from Phase 8, the change is audited). */
public record PasswordChanged(UUID userId) {}
