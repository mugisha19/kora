package com.kora.platform.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Random bearer secrets (refresh tokens, password-reset and invitation links) and their stored form.
 *
 * <p>Only the SHA-256 hash of a token is ever stored, so a database or Redis leak doesn't hand out working links or
 * sessions. A plain fast hash is enough here, unlike for passwords: the tokens carry 256 bits of randomness, so there
 * is nothing to brute-force.
 */
public final class OpaqueTokens {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private OpaqueTokens() {}

    /** 256 random bits, URL-safe Base64 without padding (43 characters). */
    public static String generate() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Lower-case hex SHA-256 (64 characters), the only form in which a token is stored or looked up. */
    public static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by every Java platform", impossible);
        }
    }
}
