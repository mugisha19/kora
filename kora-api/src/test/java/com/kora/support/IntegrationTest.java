package com.kora.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

/**
 * Full application context against real PostgreSQL and Redis (Testcontainers), with MockMvc for HTTP-level
 * assertions, emails recorded instead of sent, and metrics export switched back on (Spring Boot disables it in tests
 * by default) so the Prometheus endpoint is tested.
 *
 * <p>Every integration test uses exactly this set of annotations and properties, so Spring caches one context and
 * the containers start once per test run instead of once per class. Name test classes {@code *IT} so that Failsafe,
 * not Surefire, runs them.
 *
 * <p>Per-IP rate limits are raised because every MockMvc request comes from the same address; per-email limits keep
 * their real values (tests use unique addresses). The refresh-token reuse grace period is zero so reuse detection is
 * observable without sleeping.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@ExtendWith(RequiresDockerCondition.class)
@SpringBootTest(
        // A real server port as well as MockMvc: the WebSocket tests need one, and one shared context is cheaper.
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "kora.rate-limits.login-ip=10000/1m",
            "kora.rate-limits.register-organization-ip=10000/1m",
            "kora.rate-limits.password-forgot-ip=10000/1m",
            "kora.rate-limits.password-reset-ip=10000/1m",
            "kora.rate-limits.invitation-preview-ip=10000/1m",
            "kora.rate-limits.invitation-accept-ip=10000/1m",
            "kora.identity.refresh-token.reuse-grace-period=0s",
            "kora.organization.invitation-expiry.initial-delay=PT1H"
        })
@AutoConfigureMockMvc
@AutoConfigureMetrics
@Import({TestcontainersConfiguration.class, TestEmailConfiguration.class})
public @interface IntegrationTest {}
