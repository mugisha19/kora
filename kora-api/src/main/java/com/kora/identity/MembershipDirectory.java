package com.kora.identity;

import java.util.List;
import java.util.UUID;

/**
 * The user's memberships, needed for {@code /me} and every session response. Identity defines this port and the
 * organization module implements it (dependency inversion): memberships belong to organizations, but identity
 * must not depend on the organization module, or the two modules would depend on each other in a cycle.
 */
public interface MembershipDirectory {

    List<MembershipView> membershipsOf(UUID userId);
}
