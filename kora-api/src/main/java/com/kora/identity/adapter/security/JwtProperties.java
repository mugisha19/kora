package com.kora.identity.adapter.security;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Access token settings ({@code kora.identity.jwt.*}). Keys are PEM strings supplied through environment variables,
 * never committed: {@code privateKey} is PKCS#8 ({@code BEGIN PRIVATE KEY}), public keys are X.509
 * ({@code BEGIN PUBLIC KEY}), all EC P-256.
 *
 * @param issuer {@code iss} claim, checked on every incoming token
 * @param accessTokenLifetime how long an access token is valid (15 minutes)
 * @param keyId {@code kid} header of tokens signed with the current key
 * @param privateKey current signing key
 * @param publicKey public half of the current signing key
 * @param previousKeys public keys of retired signing keys, still accepted until their tokens have expired
 * @param allowEphemeralKey generate a throw-away key when none is configured (development and tests only)
 */
@ConfigurationProperties("kora.identity.jwt")
record JwtProperties(
        String issuer,
        Duration accessTokenLifetime,
        String keyId,
        String privateKey,
        String publicKey,
        List<VerificationKey> previousKeys,
        boolean allowEphemeralKey) {

    JwtProperties {
        previousKeys = previousKeys == null ? List.of() : List.copyOf(previousKeys);
    }

    record VerificationKey(String keyId, String publicKey) {}
}
