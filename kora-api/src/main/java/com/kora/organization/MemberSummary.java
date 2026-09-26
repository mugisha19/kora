package com.kora.organization;

import java.util.UUID;

/** A member of the active organization as other modules see them. */
public record MemberSummary(UUID userId, String fullName, String email, Role role) {}
