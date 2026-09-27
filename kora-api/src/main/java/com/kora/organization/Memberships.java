package com.kora.organization;

import java.util.Optional;
import java.util.UUID;

/**
 * The membership check for connections that don't pass the HTTP tenant filter (the WebSocket handshake of feature
 * 18). Runs in the named organization's scope, so it can only see that organization's rows.
 */
public interface Memberships {

    Optional<ActiveMember> activeMember(UUID organizationId, UUID userId);
}
