package com.kora.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.platform.web.CorrelationId;
import com.kora.support.IntegrationTest;
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
        assertThat(mvc.get().uri("/api/v1/does-not-exist").header(CorrelationId.HEADER, "it-correlation-1"))
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
}
