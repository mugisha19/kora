package com.kora.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import com.kora.platform.web.CorrelationId;
import com.kora.support.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

/** The platform conventions hold in the fully assembled application, not only in the web slice test. */
@IntegrationTest
class PlatformConventionsIT {

    @Autowired
    private MockMvcTester mvc;

    @Test
    void anUnknownApiPathIsAProblemDetails404WithTheCallersCorrelationId() {
        assertThat(mvc.get()
                        .uri("/api/v1/does-not-exist")
                        .with(jwt().jwt(token -> token.subject(UUID.randomUUID().toString())))
                        .header(CorrelationId.HEADER, "it-correlation-1"))
                .hasStatus(HttpStatus.NOT_FOUND)
                .hasContentType(MediaType.APPLICATION_PROBLEM_JSON)
                .hasHeader(CorrelationId.HEADER, "it-correlation-1")
                .bodyJson()
                .isLenientlyEqualTo("""
                        {
                          "type": "urn:kora:problem:resource.not_found",
                          "status": 404,
                          "code": "resource.not_found",
                          "instance": "/api/v1/does-not-exist",
                          "correlationId": "it-correlation-1"
                        }
                        """);
    }

    @Test
    void unauthenticatedCallersLearnNothingAboutWhichPathsExist() {
        assertThat(mvc.get().uri("/api/v1/does-not-exist"))
                .hasStatus(HttpStatus.UNAUTHORIZED)
                .hasContentType(MediaType.APPLICATION_PROBLEM_JSON)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("auth.unauthenticated");
    }

    @Test
    void operationalEndpointsGetACorrelationIdToo() {
        assertThat(mvc.get().uri("/actuator/health")).hasStatusOk().headers().containsHeader(CorrelationId.HEADER);
    }

    @Test
    void prometheusMetricsAreExposedForScraping() {
        assertThat(mvc.get().uri("/actuator/prometheus"))
                .hasStatusOk()
                .bodyText()
                .contains("jvm_memory_used_bytes");
    }

    /** W3C trace context in, the same trace id out: one id joins the logs, the audit trail and the traces. */
    @Test
    void withoutACorrelationIdTheTraceIdIsUsed() {
        assertThat(mvc.get()
                        .uri("/actuator/health")
                        .header("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"))
                .hasStatusOk()
                .hasHeader(CorrelationId.HEADER, "4bf92f3577b34da6a3ce929d0e0e4736");
    }

    @Test
    void businessEventsAreCounted() {
        assertThat(mvc.post()
                        .uri("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@example.com\",\"password\":\"not-the-password-1\"}"))
                .hasStatus(HttpStatus.UNAUTHORIZED);

        assertThat(mvc.get().uri("/actuator/prometheus"))
                .bodyText()
                .contains("kora_sign_ins_total{outcome=\"failure\"");
    }
}
