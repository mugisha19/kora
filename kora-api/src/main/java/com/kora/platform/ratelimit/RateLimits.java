package com.kora.platform.ratelimit;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Looks up named limits from configuration ({@code kora.rate-limits.<name>: 20/1m}) with the default the calling
 * use case declares, so limits can be tuned per environment without code changes.
 */
@Component
public class RateLimits {

    private final Environment environment;

    RateLimits(Environment environment) {
        this.environment = environment;
    }

    public RateLimit named(String name, String defaultSpec) {
        return RateLimit.parse(name, environment.getProperty("kora.rate-limits." + name, defaultSpec));
    }
}
