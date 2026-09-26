package com.kora.identity;

import java.util.UUID;

/** One organization the user belongs to, and their role there (a {@code Role} name from the organization module). */
public record MembershipView(UUID organizationId, String organizationName, String organizationSlug, String role) {}
