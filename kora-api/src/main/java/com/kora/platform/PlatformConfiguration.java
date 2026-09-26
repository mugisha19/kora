package com.kora.platform;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Infrastructure every module relies on: a {@link Clock} (never {@code Instant.now()} in business code, so expiry
 * rules are testable), asynchronous event listeners and scheduled jobs.
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableScheduling
class PlatformConfiguration {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
