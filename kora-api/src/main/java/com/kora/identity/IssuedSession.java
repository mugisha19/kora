package com.kora.identity;

import java.time.Duration;

/**
 * A new or refreshed session: a short-lived access token for the {@code Authorization} header, and an opaque
 * refresh token that only ever travels in the {@code HttpOnly} cookie.
 */
public record IssuedSession(
        String accessToken, long expiresInSeconds, String refreshToken, Duration refreshTokenLifetime, MeView user) {

    @Override
    public String toString() {
        // Tokens are credentials: keep them out of logs and exception messages.
        return "IssuedSession[userId=" + user.id() + ", expiresInSeconds=" + expiresInSeconds + "]";
    }
}
