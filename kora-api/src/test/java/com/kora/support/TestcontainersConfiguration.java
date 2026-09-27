package com.kora.support;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

/**
 * Real infrastructure for integration tests, started once and shared by every test class that uses the same
 * Spring context. {@link ServiceConnection} wires each container's address and credentials into Spring Boot, so no
 * test hard-codes connection details. Same major versions as production: tests never run on H2 or an embedded Redis.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    static final DockerImageName POSTGRES_IMAGE = DockerImageName.parse("postgres:18-alpine");
    static final DockerImageName REDIS_IMAGE = DockerImageName.parse("redis:8-alpine");
    static final DockerImageName SEAWEEDFS_IMAGE = DockerImageName.parse("chrislusf/seaweedfs:4.47");

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

    /** S3-compatible storage for attachments, with the same credentials file as compose.yaml. */
    @Bean
    GenericContainer<?> seaweedfs() {
        return new GenericContainer<>(SEAWEEDFS_IMAGE)
                .withCommand("server", "-s3", "-s3.config=/etc/seaweedfs/s3.json", "-dir=/data")
                .withCopyFileToContainer(
                        MountableFile.forHostPath("config/seaweedfs-s3.json"), "/etc/seaweedfs/s3.json")
                .withExposedPorts(8333)
                // Anonymous requests are refused once the S3 gateway is up.
                .waitingFor(Wait.forHttp("/").forPort(8333).forStatusCode(403));
    }

    @Bean
    DynamicPropertyRegistrar storageProperties(@Qualifier("seaweedfs") GenericContainer<?> seaweedfs) {
        return properties -> properties.add(
                "kora.storage.endpoint", () -> "http://" + seaweedfs.getHost() + ":" + seaweedfs.getMappedPort(8333));
    }
}
