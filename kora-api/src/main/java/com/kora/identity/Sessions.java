package com.kora.identity;

import java.util.UUID;

/** Starts sessions for users whose identity another module has just established (registration, invitations). */
public interface Sessions {

    /** Call after the transaction that created or verified the user has committed. */
    IssuedSession start(UUID userId);
}
