package com.kora.identity.application;

import java.util.UUID;

/**
 * Refresh tokens grouped in <em>families</em>: one family per sign-in, one new token per refresh. Rotation and reuse
 * detection live behind this port (Redis in production) because they must be atomic across API instances.
 *
 * <p>Presenting a token that was already exchanged means it was copied: the legitimate client and an attacker now
 * hold the same token, and there's no way to tell which is which. So the whole family is revoked, signing out both,
 * unless the reuse happens within a short grace period, which is the normal case of two browser tabs refreshing at
 * the same moment (ADR 0007).
 */
public interface RefreshTokenStore {

    /** Starts a family for a new sign-in and returns its first token. */
    String startFamily(UUID userId);

    /** Exchanges a token for its successor, or rejects it (unknown, expired, revoked or reused). */
    Rotation rotate(String refreshToken);

    /** Signs out the session the token belongs to. Unknown tokens are ignored. */
    void revokeFamily(String refreshToken);

    /** Signs the user out everywhere, e.g. after a password reset. */
    void revokeAll(UUID userId);

    sealed interface Rotation {

        record Rotated(UUID userId, String newRefreshToken) implements Rotation {

            @Override
            public String toString() {
                return "Rotated[userId=" + userId + "]";
            }
        }

        record Rejected(String reason) implements Rotation {}
    }
}
