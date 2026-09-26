package com.kora.platform.error;

import java.time.Duration;

/** Too many attempts; rendered as {@code 429 rate_limited} with a {@code Retry-After} header in whole seconds. */
public class RateLimitedException extends ProblemException {

    private final Duration retryAfter;

    public RateLimitedException(Duration retryAfter) {
        super(ProblemKind.TOO_MANY_REQUESTS, PlatformErrorCodes.RATE_LIMITED, "Too many attempts; try again later");
        this.retryAfter = retryAfter;
    }

    /** Rounded up, and at least one second, so a client never retries too early. */
    public long retryAfterSeconds() {
        long seconds = retryAfter.toSeconds() + (retryAfter.toNanosPart() > 0 ? 1 : 0);
        return Math.max(1, seconds);
    }
}
