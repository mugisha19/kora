package com.kora.platform.ratelimit;

import java.time.Duration;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A named limit such as "20 attempts per minute", written {@code 20/1m} in configuration
 * ({@code s}, {@code m}, {@code h} or {@code d} units).
 */
public record RateLimit(String name, long capacity, Duration period) {

    private static final Pattern SPEC = Pattern.compile("^(\\d+)/(\\d+)([smhd])$");

    public RateLimit {
        Objects.requireNonNull(name, "name");
        if (capacity < 1 || period.isNegative() || period.isZero()) {
            throw new IllegalArgumentException("Rate limit " + name + " needs a positive capacity and period");
        }
    }

    public static RateLimit parse(String name, String spec) {
        Matcher matcher = SPEC.matcher(spec.strip());
        if (!matcher.matches()) {
            throw new IllegalArgumentException(
                    "Rate limit " + name + " must look like 20/1m (count/amount+unit), was: " + spec);
        }
        long amount = Long.parseLong(matcher.group(2));
        Duration period = switch (matcher.group(3)) {
            case "s" -> Duration.ofSeconds(amount);
            case "m" -> Duration.ofMinutes(amount);
            case "h" -> Duration.ofHours(amount);
            default -> Duration.ofDays(amount);
        };
        return new RateLimit(name, Long.parseLong(matcher.group(1)), period);
    }
}
