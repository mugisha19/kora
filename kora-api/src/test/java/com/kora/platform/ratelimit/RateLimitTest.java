package com.kora.platform.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.RateLimitedException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RateLimitTest {

    @Test
    void parsesCountPerPeriod() {
        assertThat(RateLimit.parse("login-email", "10/15m"))
                .isEqualTo(new RateLimit("login-email", 10, Duration.ofMinutes(15)));
        assertThat(RateLimit.parse("x", " 3/1h ").period()).isEqualTo(Duration.ofHours(1));
        assertThat(RateLimit.parse("x", "5/30s").period()).isEqualTo(Duration.ofSeconds(30));
        assertThat(RateLimit.parse("x", "1/2d").period()).isEqualTo(Duration.ofDays(2));
    }

    @ParameterizedTest
    @ValueSource(strings = {"10", "10/m", "ten/1m", "0/1m", "5/0m", "5/1w"})
    void rejectsMalformedSpecs(String spec) {
        assertThatThrownBy(() -> RateLimit.parse("login", spec)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void retryAfterIsRoundedUpToWholeSecondsAndNeverZero() {
        assertThat(new RateLimitedException(Duration.ofMillis(1)).retryAfterSeconds())
                .isEqualTo(1);
        assertThat(new RateLimitedException(Duration.ofMillis(2_100)).retryAfterSeconds())
                .isEqualTo(3);
        assertThat(new RateLimitedException(Duration.ofSeconds(4)).retryAfterSeconds())
                .isEqualTo(4);
    }
}
