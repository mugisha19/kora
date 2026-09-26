package com.kora.platform.ratelimit;

/**
 * Throttles repeated attempts per key (an IP address, an email address) to slow down password guessing and email
 * flooding. Keys are hashed before storage: an email address is personal data and doesn't belong in Redis.
 */
public interface RateLimiter {

    /**
     * Records one attempt for {@code key} under {@code limit}.
     *
     * @throws com.kora.platform.error.RateLimitedException when the limit is exhausted
     */
    void acquire(RateLimit limit, String key);
}
