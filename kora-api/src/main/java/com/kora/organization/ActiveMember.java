package com.kora.organization;

import java.util.UUID;

/** The caller as a member of the active organization. */
public record ActiveMember(UUID organizationId, UUID userId, UUID membershipId, Role role) {}
