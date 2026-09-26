package com.kora.organization;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static com.kora.support.TestAccounts.PASSWORD;
import static com.kora.support.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 03: expiring, single-use email invitations, for new and existing accounts. */
@IntegrationTest
class InvitationsIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private JdbcClient jdbc;

    private TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
    }

    @Test
    void invitesByEmailAndListsThePendingInvitation() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("invitee");

        assertThat(conforms(invite(admin, email, "PROJECT_MANAGER")))
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "email": "%s", "role": "PROJECT_MANAGER", "status": "PENDING", "invitedByName": "Admin User" }
                        """.formatted(email));
        assertThat(emails.awaitEmail(email, 1).body())
                .contains("Admin User invited you")
                .contains("as a project manager")
                .contains("http://localhost:4200/invitations/");
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/invitations?status=PENDING")
                        .headers(admin.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.content[*].email")
                .asArray()
                .containsExactly(email);
    }

    @Test
    void refusesMembersAndDuplicatePendingInvitations() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("twice");
        invite(admin, email, "MEMBER");

        assertThat(conforms(invite(admin, email.toUpperCase(), "MEMBER")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.already_pending");
        assertThat(conforms(invite(admin, admin.email(), "MEMBER")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "code": "invitations.already_member", "errors": [{ "field": "email" }] }
                        """);
    }

    @Test
    void aNewPersonPreviewsAcceptsAndIsSignedIn() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("newcomer");
        invite(admin, email, "MEMBER");
        String token = tokenSentTo(email);

        assertThat(conforms(preview(token))).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        { "email": "%s", "role": "MEMBER", "invitedByName": "Admin User", "existingAccount": false }
                        """.formatted(email));
        assertThat(conforms(accept(token, "{\"fullName\":\"Grace Mukamana\",\"password\":\"%s\"}".formatted(PASSWORD))))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "user": { "email": "%s", "fullName": "Grace Mukamana",
                                    "memberships": [{ "organizationId": "%s", "role": "MEMBER" }] } }
                        """.formatted(email, admin.organizationId()));
        assertThat(conforms(preview(token)))
                .as("single use")
                .hasStatus(HttpStatus.GONE)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.already_accepted");
    }

    @Test
    void aNewAccountNeedsANameAndAnAcceptablePassword() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("nameless");
        invite(admin, email, "MEMBER");
        String token = tokenSentTo(email);

        assertThat(conforms(accept(token, "{\"password\":\"%s\"}".formatted(PASSWORD))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "fullName", "code": "required" }] }
                        """);
        assertThat(conforms(accept(token, "{\"fullName\":\"A B\",\"password\":\"password1234\"}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "password", "code": "password.breached" }] }
                        """);
        assertThat(preview(token)).as("failed attempts don't use the link up").hasStatusOk();
    }

    @Test
    void anExistingAccountAcceptsWithItsCurrentPassword() {
        Session admin = accounts.registerOrganization();
        Session elsewhere = accounts.registerOrganization();
        invite(admin, elsewhere.email(), "VIEWER");
        String token = tokenSentTo(elsewhere.email());

        assertThat(conforms(preview(token)))
                .bodyJson()
                .extractingPath("$.existingAccount")
                .isEqualTo(true);
        assertThat(conforms(accept(token, "{\"password\":\"wrong-password-here\"}")))
                .hasStatus(HttpStatus.UNAUTHORIZED)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("auth.invalid_credentials");
        assertThat(conforms(accept(token, "{\"password\":\"%s\"}".formatted(PASSWORD))))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.user.memberships")
                .asArray()
                .hasSize(2);
    }

    @Test
    void revokesPendingInvitationsOnly() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("revoked");
        String invitationId = JsonPath.read(TestAccounts.body(invite(admin, email, "MEMBER")), "$.id");
        String token = tokenSentTo(email);

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/invitations/{id}", invitationId)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/invitations/{id}", invitationId)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.not_pending");
        assertThat(conforms(accept(token, "{\"fullName\":\"Too Late\",\"password\":\"%s\"}".formatted(PASSWORD))))
                .hasStatus(HttpStatus.GONE)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.revoked");
    }

    @Test
    void anExpiredInvitationIsGoneEvenBeforeTheJobRecordsIt() {
        Session admin = accounts.registerOrganization();
        String email = uniqueEmail("expired");
        invite(admin, email, "MEMBER");
        String token = tokenSentTo(email);
        // Travel past the 14 days by moving the expiry. JdbcClient connects as the schema owner, outside the
        // tenant-scoped JPA transactions, so row-level security doesn't apply to this test shortcut.
        jdbc.sql("update invitations set expires_at = now() - interval '1 minute' where email = ?")
                .param(email)
                .update();

        assertThat(conforms(preview(token)))
                .hasStatus(HttpStatus.GONE)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.expired");
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/invitations")
                        .headers(admin.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.content[0].status")
                .isEqualTo("EXPIRED");
    }

    @Test
    void anUnknownLinkIs404() {
        assertThat(conforms(preview("y".repeat(43))))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.not_found");
    }

    @Test
    void aMalformedTokenIsJustAnInvalidLink() {
        assertThat(responseConforms(preview("short")))
                .hasStatus(HttpStatus.NOT_FOUND)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("invitations.not_found");
    }

    private MvcTestResult invite(Session admin, String email, String role) {
        return mvc.post()
                .uri("/api/v1/invitations")
                .headers(admin.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"role\":\"%s\"}".formatted(email, role))
                .exchange();
    }

    private MvcTestResult preview(String token) {
        return mvc.get().uri("/api/v1/invitations/token/{token}", token).exchange();
    }

    private MvcTestResult accept(String token, String body) {
        return mvc.post()
                .uri("/api/v1/invitations/token/{token}/accept", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private String tokenSentTo(String email) {
        return RecordingEmailSender.tokenFrom(emails.awaitEmail(email, 1), "/invitations/");
    }
}
