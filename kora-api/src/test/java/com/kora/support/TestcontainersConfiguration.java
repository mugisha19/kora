package com.kora.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Real infrastructure for integration tests, started once and shared by every test class that uses the same
 * Spring context. {@link ServiceConnection} wires each container's address and credentials into Spring Boot, so no
 * test hard-codes connection details. Same major versions as production: tests never run on H2 or an embedded Redis.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:18-alpine");
    static final DockerImageName REDIS_IMAGE = DockerImageName.parse("redis:8-alpine");

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgres() {
        return new PostgreSQLContainer(POSTGRES_IMAGE);
    }

    @Bean
    @ServiceConnection(name = "redis")
    GenericContainer<?> redis() {
        return new GenericContainer<>(REDIS_IMAGE).withExposedPorts(6379);
    }
}
