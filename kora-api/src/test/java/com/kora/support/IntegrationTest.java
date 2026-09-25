package com.kora.support;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;

/**
 * Full application context against real PostgreSQL (Testcontainers), with MockMvc for HTTP-level assertions.
 *
 * <p>Every integration test uses exactly this set of annotations, so Spring caches one context and the
 * containers start once per test run instead of once per class. Name test classes {@code *IT} so that
 * Failsafe, not Surefire, runs them.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@ExtendWith(RequiresDockerCondition.class)
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public @interface IntegrationTest {}
