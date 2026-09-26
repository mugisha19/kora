package com.kora.organization;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.jayway.jsonpath.JsonPath;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 03: listing members, changing roles, removing people, and the "at least one admin" rule. */
@IntegrationTest
class MembersIT {

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
    void listsSearchesAndSortsMembers() {
        Session admin = accounts.registerOrganization();
        accounts.join(admin, Role.PMO);
        accounts.join(admin, Role.VIEWER);

        assertThat(conforms(list(admin, ""))).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        { "page": 0, "size": 20, "totalElements": 3, "totalPages": 1 }
                        """);
        assertThat(conforms(list(admin, "?role=PMO")))
                .bodyJson()
                .extractingPath("$.content[*].role")
                .asArray()
                .containsExactly("PMO");
        assertThat(conforms(list(admin, "?q=viewer")))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(1);
        assertThat(conforms(list(admin, "?sort=role,asc")))
                .bodyJson()
                .extractingPath("$.content[*].role")
                .asArray()
                .containsExactly("ORG_ADMIN", "PMO", "VIEWER");
    }

    @Test
    void rejectsUnknownSortFields() {
        Session admin = accounts.registerOrganization();

        assertThat(conforms(list(admin, "?sort=memberEmail,asc")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "sort", "params": { "allowed": ["email", "fullName", "joinedAt", "role"] } }] }
                        """);
    }

    @Test
    void changesARoleWithOptimisticLocking() {
        Session admin = accounts.registerOrganization();
        Session member = accounts.join(admin, Role.MEMBER);
        String membershipId = membershipIdOf(admin, member);

        assertThat(conforms(changeRole(admin, membershipId, "\"0\"", "PROJECT_MANAGER")))
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"1\"")
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "role": "PROJECT_MANAGER", "version": 1 }
                        """);
        assertThat(conforms(changeRole(admin, membershipId, "\"0\"", "VIEWER")))
                .hasStatus(HttpStatus.PRECONDITION_FAILED);
    }

    @Test
    void theLastAdminCantBeDemotedButOneOfTwoCan() {
        Session admin = accounts.registerOrganization();
        String adminMembership = membershipIdOf(admin, admin);

        assertThat(conforms(changeRole(admin, adminMembership, "\"0\"", "MEMBER")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("members.last_admin");

        accounts.join(admin, Role.ORG_ADMIN);
        assertThat(changeRole(admin, adminMembership, "\"0\"", "MEMBER")).hasStatusOk();
    }

    @Test
    void removesAMemberWhoThenLosesAccess() {
        Session admin = accounts.registerOrganization();
        Session member = accounts.join(admin, Role.MEMBER);

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/members/{id}", membershipIdOf(admin, member))
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(mvc.get().uri("/api/v1/organization").headers(member.headers()))
                .hasStatus(HttpStatus.FORBIDDEN)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("tenant.forbidden");
    }

    @Test
    void nobodyCanRemoveThemselves() {
        Session admin = accounts.registerOrganization();

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/members/{id}", membershipIdOf(admin, admin))
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("members.self_removal");
    }

    @Test
    void aProfileChangeShowsUpInTheMemberList() {
        Session admin = accounts.registerOrganization();
        Session member = accounts.join(admin, Role.MEMBER);

        mvc.patch()
                .uri("/api/v1/me")
                .headers(member.authorization())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Jean Bosco Renamed\"}")
                .exchange();

        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(list(admin, "?q=renamed"))
                        .bodyJson()
                        .extractingPath("$.totalElements")
                        .isEqualTo(1));
    }

    @Test
    void aMalformedMemberIdIs400() {
        Session admin = accounts.registerOrganization();

        assertThat(responseConforms(mvc.delete()
                        .uri("/api/v1/members/not-a-uuid")
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST);
    }

    private MvcTestResult list(Session session, String query) {
        return mvc.get()
                .uri("/api/v1/members" + query)
                .headers(session.headers())
                .exchange();
    }

    private MvcTestResult changeRole(Session admin, String membershipId, String ifMatch, String role) {
        return mvc.patch()
                .uri("/api/v1/members/{id}", membershipId)
                .headers(admin.headers())
                .header(HttpHeaders.IF_MATCH, ifMatch)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"%s\"}".formatted(role))
                .exchange();
    }

    private String membershipIdOf(Session admin, Session person) {
        String body = TestAccounts.body(list(admin, "?size=100"));
        List<String> ids = JsonPath.read(body, "$.content[?(@.userId == '%s')].id".formatted(person.userId()));
        return ids.getFirst();
    }
}
