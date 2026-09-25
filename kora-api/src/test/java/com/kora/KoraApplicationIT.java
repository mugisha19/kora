package com.kora;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.support.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

/** Smoke test: the whole application starts against real PostgreSQL and reports itself healthy. */
@IntegrationTest
class KoraApplicationIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private JdbcClient jdbc;

    @Test
    void connectsToPostgresOfTheProductionMajorVersion() {
        String version = jdbc.sql("show server_version").query(String.class).single();

        assertThat(version).startsWith("18.");
    }

    @Test
    void reportsHealthUp() {
        assertThat(mvc.get().uri("/actuator/health"))
                .hasStatus(HttpStatus.OK)
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("UP");
    }

    @Test
    void exposesBuildInfo() {
        assertThat(mvc.get().uri("/actuator/info"))
                .hasStatus(HttpStatus.OK)
                .bodyJson()
                .extractingPath("$.build.artifact")
                .isEqualTo("kora-api");
    }
}
