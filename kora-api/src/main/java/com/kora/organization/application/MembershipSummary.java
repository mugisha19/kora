package com.kora.organization.application;

import com.kora.organization.Role;
import java.util.UUID;

/** A membership joined with its organization's name, for {@code /me} and session responses. */
public record MembershipSummary(UUID organizationId, String organizationName, String organizationSlug, Role role) {}
