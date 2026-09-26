package com.kora.identity.application;

import java.time.Duration;
import java.util.UUID;

/** Issues short-lived signed access tokens (JWT). The organization is deliberately not in the token (ADR 0005). */
public interface AccessTokenIssuer {

    AccessToken issue(UUID userId);

    record AccessToken(String value, Duration lifetime) {

        @Override
        public String toString() {
            return "AccessToken[lifetime=" + lifetime + "]";
        }
    }
}
