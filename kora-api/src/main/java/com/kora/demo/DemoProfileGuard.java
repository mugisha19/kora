package com.kora.demo;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Stops the application when the demo profile is switched on next to production: the demo creates accounts whose
 * password is published in the README.
 */
@Component
@Profile("demo")
class DemoProfileGuard {

    DemoProfileGuard(Environment environment) {
        if (environment.matchesProfiles("prod")) {
            throw new IllegalStateException(
                    "The demo profile must never run with prod: it creates accounts with a published password");
        }
    }
}
