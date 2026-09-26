package com.kora.identity.application;

/**
 * Strategy for hashing passwords (Argon2id today). Callers never compare hashes themselves: {@link #matches} is
 * constant-time and understands the parameters stored inside each hash, so the algorithm can be tuned later without
 * invalidating existing passwords.
 */
public interface PasswordHasher {

    String hash(String rawPassword);

    boolean matches(String rawPassword, String hash);
}
