package com.kora.organization;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 02: the active organization's settings, with optimistic locking. */
@IntegrationTest
class OrganizationIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
    }

    @Test
    void returnsTheActiveOrganizationWithItsVersionAsETag() {
        Session admin = accounts.registerOrganization();

        MvcTestResult result = conforms(
                mvc.get().uri("/api/v1/organization").headers(admin.headers()).exchange());

        assertThat(result)
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"0\"")
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "id": "%s", "currency": "RWF", "timeZone": "Africa/Kigali", "version": 0 }
                        """.formatted(admin.organizationId()));
    }

    @Test
    void updatesWithTheCurrentVersionAndReturnsTheNextOne() {
        Session admin = accounts.registerOrganization();

        assertThat(conforms(update(admin, "\"0\"", "{\"name\":\"Akagera Digital\",\"currency\":\"USD\"}")))
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"1\"")
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "name": "Akagera Digital", "currency": "USD", "timeZone": "Africa/Kigali", "version": 1 }
                        """);
    }

    @Test
    void refusesALostUpdate() {
        Session admin = accounts.registerOrganization();
        update(admin, "\"0\"", "{\"name\":\"First writer\"}");

        assertThat(conforms(update(admin, "\"0\"", "{\"name\":\"Second writer\"}")))
                .hasStatus(HttpStatus.PRECONDITION_FAILED)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("concurrency.stale_version");
    }

    @Test
    void requiresIfMatch() {
        Session admin = accounts.registerOrganization();

        assertThat(responseConforms(mvc.patch()
                        .uri("/api/v1/organization")
                        .headers(admin.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"No precondition\"}")
                        .exchange()))
                .hasStatus(HttpStatus.PRECONDITION_REQUIRED)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("concurrency.if_match_required");
    }

    @Test
    void validatesCurrencyAndTimeZoneAgainstTheStandards() {
        Session admin = accounts.registerOrganization();

        assertThat(conforms(update(admin, "\"0\"", "{\"currency\":\"ZZZ\"}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "currency", "code": "invalid" }] }
                        """);
        assertThat(conforms(update(admin, "\"0\"", "{\"timeZone\":\"+02:00\"}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "timeZone", "code": "invalid" }] }
                        """);
    }

    private MvcTestResult update(Session session, String ifMatch, String body) {
        return mvc.patch()
                .uri("/api/v1/organization")
                .headers(session.headers())
                .header(HttpHeaders.IF_MATCH, ifMatch)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }
}
